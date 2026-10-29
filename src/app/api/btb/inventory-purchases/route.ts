import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { BTB_COOKIE, roleFromSession } from "@/lib/btb-auth";
import { supabase } from "@/lib/supabase";
import { isMonthKey } from "@/lib/month-end-inventory";
import { entryAmount, isDuplicateInvoice, type PurchaseEntry } from "@/lib/inventory-purchases";

// Purchase entry API. The BTB cookie is validated server-side; the role is
// resolved from the session token, never from the request body. Supervisor+ may
// record purchases (staff are read-only). Every field is validated here — the
// browser is not trusted for month/date consistency, amounts, or duplicates.
const PURCHASE_ROLES = ["manager", "supervisor", "corporate", "admin"];

export async function POST(req: Request) {
  const cookieStore = await cookies();
  const role = roleFromSession(cookieStore.get(BTB_COOKIE)?.value);
  if (!role) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  if (!PURCHASE_ROLES.includes(role)) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  const { count_month, purchase_date, type, supplier, description, amount, reference, notes } = body ?? {};

  if (!isMonthKey(count_month)) return NextResponse.json({ error: "invalid month" }, { status: 400 });
  if (type !== "gfs" && type !== "local") return NextResponse.json({ error: "invalid type" }, { status: 400 });
  if (typeof description !== "string" || !description.trim()) {
    return NextResponse.json({ error: "description required" }, { status: 400 });
  }
  // The purchase date must be a real date inside the stated month.
  if (typeof purchase_date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(purchase_date)) {
    return NextResponse.json({ error: "invalid date" }, { status: 400 });
  }
  if (purchase_date.slice(0, 7) !== count_month) {
    return NextResponse.json({ error: "date not in month" }, { status: 400 });
  }
  const amt = entryAmount({ count_month, purchase_date, type, description, amount: Number(amount) });
  if (!Number.isFinite(Number(amount)) || Number(amount) < 0) {
    return NextResponse.json({ error: "invalid amount" }, { status: 400 });
  }

  const ref = typeof reference === "string" && reference.trim() ? reference.trim() : null;
  const sup = typeof supplier === "string" && supplier.trim() ? supplier.trim() : type === "gfs" ? "GFS" : null;

  // Duplicate-invoice guard for GFS entries that carry a reference.
  if (type === "gfs" && ref) {
    const { data: existingRows } = await supabase
      .from("inventory_purchases")
      .select("id, type, supplier, reference, purchase_date, amount, description, count_month");
    const entries = (existingRows ?? []) as PurchaseEntry[];
    const candidate: PurchaseEntry = { count_month, purchase_date, type, supplier: sup, description: description.trim(), amount: amt, reference: ref };
    if (isDuplicateInvoice(entries, candidate)) {
      return NextResponse.json({ error: "duplicate invoice reference" }, { status: 409 });
    }
  }

  const { data, error } = await supabase
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
  const role = roleFromSession(cookieStore.get(BTB_COOKIE)?.value);
  if (!role) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const month = searchParams.get("month");
  if (!isMonthKey(month)) return NextResponse.json({ error: "invalid month" }, { status: 400 });

  const { data, error } = await supabase
    .from("inventory_purchases")
    .select("*")
    .eq("count_month", month)
    .order("purchase_date")
    .order("created_at");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ purchases: data ?? [] });
}
