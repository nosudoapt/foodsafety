import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { BTB_COOKIE, roleFromSession } from "@/lib/btb-auth";
import { supabase } from "@/lib/supabase";
import { isMonthKey } from "@/lib/month-end-inventory";

// Reopen a finalized month so it can be corrected. The original finalized
// snapshot is NEVER deleted — status flips to 'draft' and who/why is recorded,
// so history is preserved and the month must be explicitly re-finalized.
// Manager/Admin only. Blocks if ANY later month is still finalized, because a
// correction here would silently invalidate downstream accounting.
const MANAGER_ROLES = ["manager", "admin"];

export async function POST(req: Request) {
  const cookieStore = await cookies();
  const role = roleFromSession(cookieStore.get(BTB_COOKIE)?.value);
  if (!role) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  if (!MANAGER_ROLES.includes(role)) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  const { count_month, reason } = body ?? {};
  if (!isMonthKey(count_month)) return NextResponse.json({ error: "invalid month" }, { status: 400 });

  // A correction reason is mandatory — reopening must be explicit and audited.
  const why = typeof reason === "string" ? reason.trim() : "";
  if (!why) return NextResponse.json({ error: "reason required" }, { status: 400 });

  // Block if ANY downstream (later) month is finalized — string month keys
  // compare chronologically ('2025-10' > '2025-09').
  const { data: later } = await supabase
    .from("inventory_month_snapshots")
    .select("count_month")
    .eq("status", "finalized")
    .gt("count_month", count_month);
  if ((later ?? []).length > 0) {
    const months = (later as { count_month: string }[]).map((r) => r.count_month).join(", ");
    return NextResponse.json(
      { error: `downstream month(s) finalized: ${months}. Reopen those first.` },
      { status: 409 },
    );
  }

  const { data: existing } = await supabase
    .from("inventory_month_snapshots")
    .select("*")
    .eq("count_month", count_month)
    .maybeSingle();
  if (!existing) return NextResponse.json({ error: "not finalized" }, { status: 404 });
  if (existing.status !== "finalized") return NextResponse.json({ error: "already reopened" }, { status: 409 });

  // Flip to draft — keep the row and its figures for the audit trail.
  const { data: updated, error } = await supabase
    .from("inventory_month_snapshots")
    .update({ status: "draft", reopened_by: role, reopened_at: new Date().toISOString(), reopen_reason: why })
    .eq("count_month", count_month)
    .eq("status", "finalized") // guard the transition
    .select()
    .single();
  if (error || !updated) return NextResponse.json({ error: error?.message ?? "reopen failed" }, { status: 500 });

  await supabase.from("inventory_audit_log").insert({
    count_month,
    action: "reopen",
    actor: role,
    reason: why,
    snapshot: existing,
    version: existing.version ?? 1,
  });

  return NextResponse.json({ ok: true, snapshot: updated });
}
