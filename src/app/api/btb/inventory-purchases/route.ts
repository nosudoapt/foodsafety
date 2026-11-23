import { NextResponse } from "next/server";
import { databaseFailure } from "@/lib/btb-api";
import { btbInventoryRoute, type BtbInventoryScope } from "@/lib/btb-inventory-route";

export const GET = btbInventoryRoute(readPurchases);
export const POST = btbInventoryRoute(savePurchase);
import { inventoryDb } from "@/lib/supabase-server";
import { isMonthKey } from "@/lib/month-end-inventory";
import { isDateInMonth } from "@/lib/btb-inventory-api";
import { requireEditableMonth } from "@/lib/inventory-server-guards";
import { entryAmount, isDuplicateInvoice, type PurchaseEntry } from "@/lib/inventory-purchases";

// Purchase entry API. The BTB cookie is validated server-side; the role is
// resolved from the session token, never from the request body. Supervisor+ may
// record purchases (staff are read-only). Every field is validated here — the
// browser is not trusted for month/date consistency, amounts, or duplicates.
const PURCHASE_ROLES = ["manager", "supervisor", "corporate", "admin"];

async function savePurchase(scope: BtbInventoryScope, req: Request) {
  const locationId = scope.location.id;
  // The workspace session already resolved and authorized this branch.
  const role = scope.identity.role;
  if (!PURCHASE_ROLES.includes(role)) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  const { count_month, purchase_date, type, supplier, description, amount, reference, notes } = body ?? {};

  if (!isMonthKey(count_month)) return NextResponse.json({ error: "invalid month" }, { status: 400 });
  if (type !== "gfs" && type !== "local") return NextResponse.json({ error: "invalid type" }, { status: 400 });
  if (typeof description !== "string" || !description.trim()) {
    return NextResponse.json({ error: "description required" }, { status: 400 });
  }
  if (description.trim().length > 500) return NextResponse.json({ error: "description too long" }, { status: 400 });
  // The purchase date must be a real calendar date inside the stated month.
  if (!isDateInMonth(purchase_date, count_month)) return NextResponse.json({ error: "invalid date" }, { status: 400 });

  if (amount === "" || amount === null || amount === undefined) {
    return NextResponse.json({ error: "amount required" }, { status: 400 });
  }
  const amountNumber = Number(amount);
  if (!Number.isFinite(amountNumber) || amountNumber < 0 || amountNumber > 9_999_999_999.99) {
    return NextResponse.json({ error: "invalid amount" }, { status: 400 });
  }
  const amt = entryAmount({ count_month, purchase_date, type, description, amount: amountNumber });

  // Normalize GFS identity fields before the DB unique index sees them. This
  // makes concurrent "inv-1" / "INV-1" requests collide instead of double count.
  const ref = typeof reference === "string" && reference.trim() ? reference.trim().toUpperCase() : null;
  const sup = type === "gfs"
    ? (typeof supplier === "string" && supplier.trim() ? supplier.trim() : "GFS").toUpperCase()
    : null;
  if (type === "gfs" && !ref) return NextResponse.json({ error: "GFS invoice reference required" }, { status: 400 });
  if ((ref?.length ?? 0) > 200 || (sup?.length ?? 0) > 200) {
    return NextResponse.json({ error: "supplier/reference too long" }, { status: 400 });
  }

  const db = inventoryDb();
  const editable = await requireEditableMonth(db, count_month, locationId);
  if (!editable.ok) return databaseFailure(editable.cause, editable.error, editable.status);

  // Duplicate-invoice guard for GFS entries that carry a reference.
  if (type === "gfs" && ref) {
    const { data: existingRows, error: duplicateReadError } = await db
      .from("inventory_purchases")
      .select("id, type, supplier, reference, purchase_date, amount, description, count_month").eq("location_id", locationId);
    if (duplicateReadError) return databaseFailure(duplicateReadError);
    const entries = (existingRows ?? []) as PurchaseEntry[];
    const candidate: PurchaseEntry = { count_month, purchase_date, type, supplier: sup, description: description.trim(), amount: amt, reference: ref };
    if (isDuplicateInvoice(entries, candidate)) {
      return NextResponse.json({ error: "duplicate invoice reference" }, { status: 409 });
    }
  }

  const { data, error } = await db
    .from("inventory_purchases")
    .insert({
      count_month,
      purchase_date,
      type,
      supplier: sup,
      description: description.trim(),
      amount: amt,
      reference: ref,
      notes: typeof notes === "string" && notes.trim() ? notes.trim() : null,
      counted_by: role,
    })
    .select()
    .single();

  if (error) {
    // 23505 = the DB unique index on (type, supplier, reference) caught a race.
    const status = error.code === "23505" ? 409 : 500;
    return databaseFailure(error, error.code === "23505" ? "duplicate invoice reference" : "The purchase could not be saved. Please retry.", status);
  }
  return NextResponse.json({ purchase: data });
}

// List a month's purchases (any signed-in role — read-only).
async function readPurchases(scope: BtbInventoryScope, req: Request) {
  const locationId = scope.location.id;
  // The workspace session already resolved and authorized this branch.
  const role = scope.identity.role;

  const { searchParams } = new URL(req.url);
  const month = searchParams.get("month");
  if (!isMonthKey(month)) return NextResponse.json({ error: "invalid month" }, { status: 400 });

  const { data, error } = await inventoryDb()
    .from("inventory_purchases")
    .select("*")
    .eq("location_id", locationId)
    .eq("count_month", month)
    .order("purchase_date")
    .order("created_at");
  if (error) return databaseFailure(error);
  return NextResponse.json({ purchases: data ?? [] });
}
