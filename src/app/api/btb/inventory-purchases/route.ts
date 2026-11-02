import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { BTB_COOKIE } from "@/lib/btb-auth";
import { verifiedBtbRole as roleFromSession } from "@/lib/btb-api";
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

export async function POST(req: Request) {
  const cookieStore = await cookies();
  const role = await roleFromSession(cookieStore.get(BTB_COOKIE)?.value);
  if (!role) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
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
  const editable = await requireEditableMonth(db, count_month);
  if (!editable.ok) return NextResponse.json({ error: editable.error }, { status: editable.status });

  // Duplicate-invoice guard for GFS entries that carry a reference.
  if (type === "gfs" && ref) {
    const { data: existingRows, error: duplicateReadError } = await db
      .from("inventory_purchases")
      .select("id, type, supplier, reference, purchase_date, amount, description, count_month");
    if (duplicateReadError) return NextResponse.json({ error: duplicateReadError.message }, { status: 500 });
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
    return NextResponse.json({ error: error.code === "23505" ? "duplicate invoice reference" : error.message }, { status });
  }
  return NextResponse.json({ purchase: data });
}

// List a month's purchases (any signed-in role — read-only).
export async function GET(req: Request) {
  const cookieStore = await cookies();
  const role = await roleFromSession(cookieStore.get(BTB_COOKIE)?.value);
  if (!role) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const month = searchParams.get("month");
  if (!isMonthKey(month)) return NextResponse.json({ error: "invalid month" }, { status: 400 });

  const { data, error } = await inventoryDb()
    .from("inventory_purchases")
    .select("*")
    .eq("count_month", month)
    .order("purchase_date")
    .order("created_at");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ purchases: data ?? [] });
}
