import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { BTB_COOKIE } from "@/lib/btb-auth";
import { legacyBtbRole as roleFromSession } from "@/lib/btb-api";
import { inventoryDb } from "@/lib/supabase-server";
import { INVENTORY_READ_ROLES, MONTH_END_EDIT_ROLES, assertEditableItem, isUuid, parseNewItem, requireRole } from "@/lib/btb-inventory-api";
import { requireItemWithoutFinalizedHistory } from "@/lib/inventory-server-guards";

// Inventory item list — previously read/edited DIRECTLY from the browser via
// the anon key (month-end-inventory/page.tsx). All access now goes through
// this route with the server-resolved BTB role: any signed-in role may read
// (view-ALL), manager/admin may add or update (edit-MGR_ONLY, mirroring
// src/lib/btb-access.ts). Client-supplied roles are never trusted.
//
// The master list is APPEND-ONLY: items seeded from the owner's workbook are
// `protected` and cannot be deleted or renamed. New items may be added on top.
// The database trigger (supabase/schema-inventory-master-list.sql) is the real
// guarantee; this route just answers politely instead of letting Postgres
// raise. See DELETE at the bottom.
// Requires the item_number/pack_size/case_price columns added by the same
// migration (schema-inventory-master-list.sql).
const ITEM_COLS = "id, name, unit, unit_size, category, unit_cost, position, location_id, protected, item_number, pack_size, case_price";

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

  // Two items with the same name would split one product's counts across two
  // lines and quietly halve the closing value. `ilike` gives a case-insensitive
  // match; its wildcards are escaped so a name with % or _ stays literal.
  const pattern = item.name.replace(/[\\%_]/g, (char) => `\\${char}`);
  const { data: twin, error: twinError } = await db
    .from("inventory_items")
    .select("id")
    .is("location_id", null)
    .ilike("name", pattern)
    .limit(1);
  if (twinError) return NextResponse.json({ error: twinError.message }, { status: 500 });
  if ((twin ?? []).length > 0) return NextResponse.json({ error: "an item with that name already exists" }, { status: 409 });

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
      protected: false,
      item_number: null,
      pack_size: item.pack_size,
      case_price: item.case_price,
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

  // Renaming a protected item is refused here as well as by the trigger, so
  // the client gets a sentence instead of a Postgres error string.
  const { data: current, error: currentError } = await db
    .from("inventory_items")
    .select("name, protected")
    .is("location_id", null)
    .eq("id", id)
    .maybeSingle();
  if (currentError) return NextResponse.json({ error: currentError.message }, { status: 500 });
  const editable = assertEditableItem(current, parsed.value.name);
  if (!editable.ok) {
    return NextResponse.json({ error: editable.error }, { status: current ? 409 : 404 });
  }

  const history = await requireItemWithoutFinalizedHistory(db, id);
  if (!history.ok) return NextResponse.json({ error: history.error }, { status: history.status });

  const { data, error } = await db
    .from("inventory_items")
    .update({ name: parsed.value.name, unit: parsed.value.unit, unit_cost: parsed.value.unit_cost, pack_size: parsed.value.pack_size, case_price: parsed.value.case_price })
    .is("location_id", null)
    .eq("id", id)
    .select(ITEM_COLS)
    .maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: "item not found" }, { status: 404 });
  return NextResponse.json({ item: data });
}

// Deletion rule: names seeded from the master sheet may not be removed; a name
// the crew added later may be, as long as no finalized month depends on it.
// A master item is retired by counting 0, never by vanishing from the sheet.
export async function DELETE(req: Request) {
  const cookieStore = await cookies();
  const auth = requireRole(await roleFromSession(cookieStore.get(BTB_COOKIE)?.value), MONTH_END_EDIT_ROLES);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const id = new URL(req.url).searchParams.get("id");
  if (!isUuid(id)) return NextResponse.json({ error: "invalid id" }, { status: 400 });

  const db = inventoryDb();
  const { data, error } = await db
    .from("inventory_items")
    .select("name, protected")
    .is("location_id", null)
    .eq("id", id)
    .maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: "item not found" }, { status: 404 });

  if (data.protected) {
    return NextResponse.json({
      error: `${data.name} is on the master inventory list and cannot be deleted. Count it as 0 instead.`,
      protected: true,
    }, { status: 409 });
  }

  const history = await requireItemWithoutFinalizedHistory(db, id);
  if (!history.ok) return NextResponse.json({ error: history.error }, { status: history.status });

  const { error: deleteError } = await db
    .from("inventory_items")
    .delete()
    .is("location_id", null)
    .eq("id", id);
  if (deleteError) return NextResponse.json({ error: deleteError.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}