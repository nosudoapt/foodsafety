"use client";

import { useState } from "react";
import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import BtbFeatureGate from "@/components/BtbFeatureGate";
import { Button, Input, PageHeader } from "@/components/ui";
import { LoadState } from "@/components/btb/Feedback";
import { useBtbData } from "@/components/btb/useBtbData";
import { ScheduleWeek, ScopedScheduleWorkspace } from "@/components/btb/StaffSchedule";
import { useBtbWorkspace } from "@/contexts/BtbWorkspaceContext";
import { btbToday, isIsoDate } from "@/lib/btb-team";
import { addDays, weekStart } from "@/lib/staff-schedule";
import type { PlatformBootstrap } from "@/lib/btb-platform";

export default function StaffSchedulePage() {
  return <BtbFeatureGate feature="staff_schedule" wide>{(readOnly) => <Schedule readOnly={readOnly} />}</BtbFeatureGate>;
}
function Schedule({ readOnly }: { readOnly: boolean }) {
  const { identity } = useBtbWorkspace();
  const bootstrap = useBtbData<PlatformBootstrap>(identity?.employeeId ? "/api/btb/platform/bootstrap" : null);
  const [start, setStart] = useState(() => weekStart(btbToday()));
  const locations = bootstrap.data?.locations ?? [];
  const scoped = locations.length > 0 || !!identity && ["corporate", "owner"].includes(identity.role) && !!identity.employeeId;
  const ready = !identity?.employeeId || !!bootstrap.data;
  return <div className="ops-workspace"><div className="btb-screen ops-panel"><PageHeader title="Staff schedule & hours" subtitle="Plan the week, record actual punches, review corrections and approve worked hours separately." />
    {identity?.employeeId && <LoadState loading={bootstrap.loading} error={bootstrap.error} onRetry={bootstrap.reload} />}
    </div>
    {ready && (scoped ? <ScopedScheduleWorkspace locations={locations} /> : <>
      <p className="ui-notice btb-screen">Legacy weekly schedule. Time clocking requires an individual employee account with an assigned location; shared accounts cannot record or approve personal hours.</p>
      <div className="ops-toolbar btb-screen"><div className="ui-actions"><Button variant="ghost" aria-label="Previous week" onClick={() => setStart(addDays(start, -7))}><ChevronLeft size={18} aria-hidden="true" /></Button><label className="ops-inline-field">Week of<Input type="date" value={start} onChange={(event) => { if (isIsoDate(event.target.value)) setStart(weekStart(event.target.value)); }} /></label><Button variant="ghost" aria-label="Next week" onClick={() => setStart(addDays(start, 7))}><ChevronRight size={18} aria-hidden="true" /></Button><Button variant="soft" onClick={() => setStart(weekStart(btbToday()))}>This week</Button></div>{!readOnly && <Link className="ops-text-link" href="/between-the-buns/employees">Manage employees</Link>}</div>
      <ScheduleWeek key={start} start={start} readOnly={readOnly} />
    </>)}
  </div>;
}
