import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { BTB_COOKIE } from "@/lib/btb-auth";
import { legacyBtbRole as roleFromSession } from "@/lib/btb-api";
import { inventoryDb } from "@/lib/supabase-server";
import { INVENTORY_READ_ROLES, MONTH_END_EDIT_ROLES, isUuid, parseNewItem, requireRole } from "@/lib/btb-inventory-api";
import { requireItemWithoutFinalizedHistory } from "@/lib/inventory-server-guards";

// Inventory item list — previously read/edited DIRECTLY from the browser via
// the anon key (month-end-inventory/page.tsx). All access now goes through
// this route with the server-resolved BTB role: any signed-in role may read
// (view-ALL), manager/admin may add or delete (edit-MGR_ONLY, mirroring
// src/lib/btb-access.ts). Client-supplied roles are never trusted.

const ITEM_COLS = "id, name, unit, category, unit_cost, position, location_id";

export async function GET() {
  const cookieStore = await cookies();
  const auth = requireRole(await roleFromSession(cookieStore.get(BTB_COOKIE)?.value), INVENTORY_READ_ROLES);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const { data, error } = await inventoryDb()
    .from("inventory_items")
    .select(ITEM_COLS)
    .is("location_id", null)
    .order("position")
    .order("name");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ items: data ?? [] });
}

export async function POST(req: Request) {
  const cookieStore = await cookies();
  const auth = requireRole(await roleFromSession(cookieStore.get(BTB_COOKIE)?.value), MONTH_END_EDIT_ROLES);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const body = await req.json().catch(() => ({}));
  const parsed = parseNewItem(body);
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });
  const item = parsed.value;

  const db = inventoryDb();

  // Append to the end of the list (position = current count), like the old
  // page insert did with `items.length`.
  let position = item.position;
  if (position === null) {
    const { count, error: countError } = await db.from("inventory_items").select("id", { count: "exact", head: true }).is("location_id", null);
    if (countError) return NextResponse.json({ error: countError.message }, { status: 500 });
    position = count ?? 0;
  }

  const { data, error } = await db
    .from("inventory_items")
    .insert({
      name: item.name,
      unit: item.unit,
      unit_cost: item.unit_cost,
      category: null,
      position,
      location_id: null,
    })
    .select(ITEM_COLS)
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ item: data });
}

export async function PATCH(req: Request) {
  const cookieStore = await cookies();
  const auth = requireRole(await roleFromSession(cookieStore.get(BTB_COOKIE)?.value), MONTH_END_EDIT_ROLES);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const id = new URL(req.url).searchParams.get("id");
  if (!isUuid(id)) return NextResponse.json({ error: "invalid id" }, { status: 400 });

  const body = await req.json().catch(() => ({}));
  const parsed = parseNewItem(body);
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });

  const db = inventoryDb();
  const history = await requireItemWithoutFinalizedHistory(db, id);
  if (!history.ok) return NextResponse.json({ error: history.error }, { status: history.status });

  const { data, error } = await db
    .from("inventory_items")
    .update({ name: parsed.value.name, unit: parsed.value.unit, unit_cost: parsed.value.unit_cost })
    .is("location_id", null)
    .eq("id", id)
    .select(ITEM_COLS)
    .maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: "item not found" }, { status: 404 });
  return NextResponse.json({ item: data });
}

// No DELETE handler by design: the master inventory list is STATIC per the
// owner's process — items are only ever added or updated; quantities change,
// items never disappear. Removing an item would break audit history.</think><tool_call>edit<arg_key>newString</arg_key><arg_value>// No DELETE handler by design: the master inventory list is STATIC — items
// are only ever added or updated; quantities change, items never disappear.
// Removing an item would break audit history, so nothing may ever call
// this route with destructive intent.

/** Kept as a documented dead end so a client calling DELETE gets a clear answer. */
export async function DELETE(req: Request) {
  const cookieStore = await cookies();
  const auth = requireRole(await roleFromSession(cookieStore.get(BTB_COOKIE)?.value), MONTH_END_EDIT_ROLES);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  return NextResponse.json({ error: "Inventory items cannot be deleted. Items are static — only quantities, prices and new items change." }, { status: 405 });
}
