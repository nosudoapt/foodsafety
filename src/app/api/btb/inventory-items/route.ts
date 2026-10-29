import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { BTB_COOKIE, roleFromSession } from "@/lib/btb-auth";
import { inventoryDb } from "@/lib/supabase-server";
import { MONTH_END_EDIT_ROLES, isUuid, parseNewItem, requireRole } from "@/lib/btb-inventory-api";

// Inventory item list — previously read/edited DIRECTLY from the browser via
// the anon key (month-end-inventory/page.tsx). All access now goes through
// this route with the server-resolved BTB role: any signed-in role may read
// (view-ALL), manager/admin may add or delete (edit-MGR_ONLY, mirroring
// src/lib/btb-access.ts). Client-supplied roles are never trusted.

const ITEM_COLS = "id, name, unit, category, unit_cost, position, location_id";

export async function GET() {
  const cookieStore = await cookies();
  const auth = requireRole(roleFromSession(cookieStore.get(BTB_COOKIE)?.value), ["staff", "supervisor", "manager", "corporate", "admin"]);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const { data, error } = await inventoryDb()
    .from("inventory_items")
    .select(ITEM_COLS)
    .order("position")
    .order("name");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ items: data ?? [] });
}

export async function POST(req: Request) {
  const cookieStore = await cookies();
  const auth = requireRole(roleFromSession(cookieStore.get(BTB_COOKIE)?.value), MONTH_END_EDIT_ROLES);
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
    const { count } = await db.from("inventory_items").select("id", { count: "exact", head: true });
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
      location_id: item.location_id,
    })
    .select(ITEM_COLS)
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ item: data });
}

export async function DELETE(req: Request) {
  const cookieStore = await cookies();
  const auth = requireRole(roleFromSession(cookieStore.get(BTB_COOKIE)?.value), MONTH_END_EDIT_ROLES);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const id = new URL(req.url).searchParams.get("id");
  if (!isUuid(id)) return NextResponse.json({ error: "invalid id" }, { status: 400 });

  // Counts cascade in the DB (inventory_counts.item_id ON DELETE CASCADE).
  const { error } = await inventoryDb().from("inventory_items").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
