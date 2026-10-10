"use client";

import { useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, UserPlus, CalendarPlus, Trash2 } from "lucide-react";
import BtbFeatureGate from "@/components/BtbFeatureGate";
import { Badge, Button, Card, Input, PageHeader } from "@/components/ui";
import { supabase } from "@/lib/supabase";
import { activeLocationId, locationScope } from "@/lib/locations";
import {
  STAFF_SCHEDULE_RETENTION_DAYS,
  addDays,
  dayLabel,
  isoDay,
  isValidShift,
  shiftLabel,
  shiftsByDay,
  weekDays,
  weekStart,
  type StaffMember,
  type StaffShift,
} from "@/lib/staff-schedule";

const MEMBER_COLS = "id, name, phone, email, position, location_id";
const SHIFT_COLS = "id, staff_member_id, shift_date, start_time, end_time";

// Shared weekly calendar: managers post the roster and the shifts, everyone
// (staff tablet included) reads it — staff can narrow the sheet to their own
// name with the "My schedule" filter.
export default function StaffSchedulePage() {
  return (
    <BtbFeatureGate feature="staff_schedule" wide>
      {(readOnly) => <StaffSchedule readOnly={readOnly} />}
    </BtbFeatureGate>
  );
}

function StaffSchedule({ readOnly }: { readOnly: boolean }) {
  const [tab, setTab] = useState<"calendar" | "roster">("calendar");
  const [monday, setMonday] = useState(() => weekStart(isoDay(new Date())));
  const [members, setMembers] = useState<StaffMember[]>([]);
  const [shifts, setShifts] = useState<StaffShift[]>([]);
  const [filter, setFilter] = useState(""); // "" = everyone
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const [newMember, setNewMember] = useState({ name: "", position: "", phone: "", email: "" });
  const [newShift, setNewShift] = useState({
    staff_member_id: "",
    shift_date: isoDay(new Date()),
    start_time: "09:00",
    end_time: "17:00",
  });

  const days = useMemo(() => weekDays(monday), [monday]);

  const loadRoster = async () => {
    const scope = locationScope();
    let q = supabase.from("staff_members").select(MEMBER_COLS).order("name");
    if (scope) q = q.or(scope);
    const { data, error: err } = await q;
    if (err) {
      setError("Couldn't load the roster — run supabase/schema-staff-schedule.sql, then reload.");
      return;
    }
    setMembers((data ?? []) as StaffMember[]);
    setError(null);
  };

  const loadWeek = async (start: string) => {
    const scope = locationScope();
    let q = supabase
      .from("staff_shifts")
      .select(SHIFT_COLS)
      .gte("shift_date", start)
      .lt("shift_date", addDays(start, 7))
      .order("shift_date")
      .order("start_time");
    if (scope) q = q.or(scope);
    const { data, error: err } = await q;
    if (err) {
      setError("Couldn't load this week — run supabase/schema-staff-schedule.sql, then reload.");
      setLoading(false);
      return;
    }
    setShifts((data ?? []) as unknown as StaffShift[]);
    setError(null);
    setLoading(false);
  };

  // Roster + week arrive together on mount; the week effect below re-runs it
  // whenever the arrows move (async body — no synchronous setState here).
  useEffect(() => {
    let cancelled = false;
    (async () => {
      await loadRoster();
      if (!cancelled) await loadWeek(monday);
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (loading) return; // first paint is handled by the mount effect
      if (!cancelled) await loadWeek(monday);
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [monday]);

  const shown = filter ? shifts.filter((s) => s.staff_member_id === filter) : shifts;
  const byDay = useMemo(() => shiftsByDay(shown, days), [shown, days]);
  const nameOf = (id: string | null) => members.find((m) => m.id === id)?.name ?? "Unassigned";

  const weekLabel = `${dayLabel(days[0])} – ${dayLabel(days[6])}`;

  const saveShift = async () => {
    if (readOnly || saving) return;
    if (!newShift.staff_member_id) {
      setError("Pick who the shift is for first.");
      return;
    }
    if (!isValidShift(newShift.start_time, newShift.end_time)) {
      setError("The shift must end after it starts (both as HH:MM).");
      return;
    }
    setSaving(true);
    setError(null);
    const { error: err } = await supabase.from("staff_shifts").insert({
      ...newShift,
      location_id: activeLocationId(),
    });
    if (err) {
      setError("Couldn't post the shift — run supabase/schema-staff-schedule.sql, then retry.");
      setSaving(false);
      return;
    }
    setNotice(`Shift posted for ${nameOf(newShift.staff_member_id)}`);
    setSaving(false);
    await loadWeek(monday);
  };

  const saveMember = async () => {
    if (readOnly || saving) return;
    const name = newMember.name.trim();
    if (!name) {
      setError("A name is required.");
      return;
    }
    setSaving(true);
    setError(null);
    const { error: err } = await supabase.from("staff_members").insert({
      name,
      position: newMember.position.trim() || null,
      phone: newMember.phone.trim() || null,
      email: newMember.email.trim() || null,
      location_id: activeLocationId(),
    });
    if (err) {
      setError("Couldn't add the person — run supabase/schema-staff-schedule.sql, then retry.");
      setSaving(false);
      return;
    }
    setNewMember({ name: "", position: "", phone: "", email: "" });
    setNotice(`${name} added to the roster`);
    setSaving(false);
    await loadRoster();
  };

  const removeShift = async (id: string) => {
    if (readOnly) return;
    setError(null);
    const { error: err } = await supabase.from("staff_shifts").delete().eq("id", id);
    if (err) {
      setError("Couldn't delete the shift — run supabase/schema-staff-schedule.sql, then retry.");
      return;
    }
    setNotice("Shift removed");
    await loadWeek(monday);
  };

  const removeMember = async (id: string) => {
    if (readOnly) return;
    setError(null);
    const { error: err } = await supabase.from("staff_members").delete().eq("id", id);
    if (err) {
      setError("Couldn't remove the person — run supabase/schema-staff-schedule.sql, then retry.");
      return;
    }
    setNotice("Person removed (their shifts went too)");
    await loadRoster();
  };

  const inputCls =
    "font-bold text-slate-900 text-sm bg-white border border-slate-300 rounded-xl px-3 h-9 outline-none focus:ring-2 focus:ring-red-500 focus:border-transparent";

  return (
    <div className="max-w-7xl mx-auto px-4 py-6">
      <PageHeader
        title="Staff Schedule"
        subtitle={`Weekly calendar · shifts kept ${STAFF_SCHEDULE_RETENTION_DAYS} days`}
        action={notice ? <Badge accent="green">{notice}</Badge> : undefined}
      />

      <div className="flex gap-2 mb-6">
        <Button accent="blue" variant={tab === "calendar" ? "solid" : "soft"} onClick={() => setTab("calendar")}>
          Calendar
        </Button>
        <Button accent="blue" variant={tab === "roster" ? "solid" : "soft"} onClick={() => setTab("roster")}>
          Roster
        </Button>
      </div>

      {error && (
        <div className="mb-4 rounded-xl bg-red-50 border border-red-100 px-4 py-3 text-sm text-red-700">{error}</div>
      )}

      {tab === "calendar" ? (
        <div>
          <div className="flex flex-wrap items-center gap-3 mb-4">
            <div className="flex items-center gap-1">
              <button
                aria-label="Previous week"
                className="rounded-lg border border-slate-300 bg-white p-2 text-slate-600 hover:bg-slate-50"
                onClick={() => setMonday(addDays(monday, -7))}
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <button
                className="rounded-lg border border-slate-300 bg-white px-3 h-9 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                onClick={() => setMonday(weekStart(isoDay(new Date())))}
              >
                This week
              </button>
              <button
                aria-label="Next week"
                className="rounded-lg border border-slate-300 bg-white p-2 text-slate-600 hover:bg-slate-50"
                onClick={() => setMonday(addDays(monday, 7))}
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
            <p className="text-sm font-semibold text-slate-700">{weekLabel}</p>
            <label className="text-sm text-slate-500 flex items-center gap-2">
              Show
              <select
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
                className={`${inputCls} font-bold`}
              >
                <option value="">Everyone</option>
                {members.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name}
                  </option>
                ))}
              </select>
            </label>
            <span className="text-xs text-slate-400">Shifts age out after {STAFF_SCHEDULE_RETENTION_DAYS} days</span>
            <span className="ml-auto flex gap-2 print:hidden">
              <Button
                accent="blue"
                variant="soft"
                onClick={() => {
                  const emails = members.map((m) => (m.email ?? "").trim()).filter(Boolean);
                  const lines = days.map((day) => {
                    const list = byDay[day];
                    const body = list.length
                      ? list.map((s) => `${nameOf(s.staff_member_id)} ${shiftLabel(s.start_time, s.end_time)}`).join("; ")
                      : "—";
                    return `${dayLabel(day)}: ${body}`;
                  });
                  const subject = encodeURIComponent(`Staff schedule ${weekLabel}`);
                  const text = encodeURIComponent(`Hi team,\n\nHere is the schedule for ${weekLabel}:\n\n${lines.join("\n")}\n\nThanks!`);
                  window.location.href = `mailto:${emails.join(",")}?subject=${subject}&body=${text}`;
                }}
              >
                Email schedule
              </Button>
              <Button accent="blue" variant="soft" onClick={() => window.print()}>
                Print
              </Button>
            </span>
            {!members.some((m) => (m.email ?? "").trim()) && (
              <span className="text-xs text-amber-600">Add emails on the Roster tab so Email schedule reaches staff.</span>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7 gap-3">
            {days.map((day) => (
              <Card key={day} className="p-3 min-h-[9rem]">
                <p
                  className={`text-xs font-bold uppercase tracking-wide mb-2 ${
                    day === isoDay(new Date()) ? "text-red-600" : "text-slate-500"
                  }`}
                >
                  {dayLabel(day)}
                </p>
                {loading ? (
                  <p className="text-xs text-slate-400">Loading…</p>
                ) : byDay[day].length === 0 ? (
                  <p className="text-xs text-slate-300">—</p>
                ) : (
                  <ul className="space-y-2">
                    {byDay[day].map((s) => (
                      <li
                        key={s.id}
                        className="rounded-lg bg-blue-50 border border-blue-100 px-2 py-1.5 text-xs relative"
                      >
                        <p className="font-semibold text-slate-900 pr-6">{nameOf(s.staff_member_id)}</p>
                        <p className="text-slate-600">{shiftLabel(s.start_time, s.end_time)}</p>
                        {!readOnly && (
                          <button
                            aria-label="Delete shift"
                            className="absolute top-1 right-1 text-slate-400 hover:text-red-600"
                            onClick={() => removeShift(s.id)}
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </Card>
            ))}
          </div>

          {!readOnly && (
            <Card className="p-5 mt-6">
              <p className="text-sm font-bold text-slate-900 mb-3 flex items-center gap-2">
                <CalendarPlus className="w-4 h-4 text-blue-600" /> Post a shift
              </p>
              <div className="flex flex-wrap items-end gap-3">
                <label className="text-sm">
                  <span className="block text-xs font-medium text-slate-500 mb-1">Person</span>
                  <select
                    className={inputCls}
                    value={newShift.staff_member_id}
                    onChange={(e) => setNewShift((s) => ({ ...s, staff_member_id: e.target.value }))}
                  >
                    <option value="">Choose…</option>
                    {members.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="text-sm">
                  <span className="block text-xs font-medium text-slate-500 mb-1">Day</span>
                  <Input
                    accent="blue"
                    type="date"
                    value={newShift.shift_date}
                    onChange={(e) => setNewShift((s) => ({ ...s, shift_date: e.target.value }))}
                    className="w-40"
                  />
                </label>
                <label className="text-sm">
                  <span className="block text-xs font-medium text-slate-500 mb-1">Start</span>
                  <Input
                    accent="blue"
                    type="time"
                    value={newShift.start_time}
                    onChange={(e) => setNewShift((s) => ({ ...s, start_time: e.target.value }))}
                    className="w-32"
                  />
                </label>
                <label className="text-sm">
                  <span className="block text-xs font-medium text-slate-500 mb-1">End</span>
                  <Input
                    accent="blue"
                    type="time"
                    value={newShift.end_time}
                    onChange={(e) => setNewShift((s) => ({ ...s, end_time: e.target.value }))}
                    className="w-32"
                  />
                </label>
                <Button accent="blue" onClick={saveShift} disabled={saving}>
                  {saving ? "Saving…" : "Post Shift"}
                </Button>
              </div>
            </Card>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <Card className="p-4 lg:col-span-2">
            <p className="text-sm font-bold text-slate-900 mb-3">Who works here</p>
            {loading ? (
              <p className="text-sm text-slate-400">Loading…</p>
            ) : members.length === 0 ? (
              <p className="text-sm text-slate-400">No one yet — add the first person.</p>
            ) : (
              <ul className="divide-y divide-slate-100">
                {members.map((m) => (
                  <li key={m.id} className="py-2.5 flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-slate-900">{m.name}</p>
                      <p className="text-xs text-slate-500">
                        {[m.position, m.phone, m.email].filter(Boolean).join(" · ") || "No details"}
                      </p>
                    </div>
                    {!readOnly && (
                      <button
                        aria-label={`Remove ${m.name}`}
                        className="text-slate-400 hover:text-red-600"
                        onClick={() => removeMember(m.id)}
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </Card>

          {!readOnly && (
            <Card className="p-4">
              <p className="text-sm font-bold text-slate-900 mb-3 flex items-center gap-2">
                <UserPlus className="w-4 h-4 text-blue-600" /> Add a person
              </p>
              <div className="space-y-3">
                <label className="block text-sm">
                  <span className="block text-xs font-medium text-slate-500 mb-1">Name *</span>
                  <Input
                    accent="blue"
                    value={newMember.name}
                    onChange={(e) => setNewMember((m) => ({ ...m, name: e.target.value }))}
                    placeholder="Jordan"
                  />
                </label>
                <label className="block text-sm">
                  <span className="block text-xs font-medium text-slate-500 mb-1">Position</span>
                  <Input
                    accent="blue"
                    value={newMember.position}
                    onChange={(e) => setNewMember((m) => ({ ...m, position: e.target.value }))}
                    placeholder="Grill"
                  />
                </label>
                <label className="block text-sm">
                  <span className="block text-xs font-medium text-slate-500 mb-1">Phone</span>
                  <Input
                    accent="blue"
                    value={newMember.phone}
                    onChange={(e) => setNewMember((m) => ({ ...m, phone: e.target.value }))}
                    placeholder="555-0100"
                  />
                </label>
                <label className="block text-sm">
                  <span className="block text-xs font-medium text-slate-500 mb-1">Email</span>
                  <Input
                    accent="blue"
                    type="email"
                    value={newMember.email}
                    onChange={(e) => setNewMember((m) => ({ ...m, email: e.target.value }))}
                    placeholder="jordan@foodsafe.demo"
                  />
                </label>
                <Button accent="blue" onClick={saveMember} disabled={saving}>
                  {saving ? "Saving…" : "Add Person"}
                </Button>
              </div>
            </Card>
          )}
        </div>
      )}
    </div>
  );
}
