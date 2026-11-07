"use client";

import { useMemo, useState } from "react";
import { CalendarDays, ChevronLeft, ChevronRight, ClipboardList, Info, MapPin } from "lucide-react";
import BtbFeatureGate from "@/components/BtbFeatureGate";
import { Badge, Button, Card, Input, PageHeader } from "@/components/ui";
import { IndividualLoginNotice, LoadState } from "@/components/btb/Feedback";
import { useBtbData } from "@/components/btb/useBtbData";
import { useBtbWorkspace } from "@/contexts/BtbWorkspaceContext";
import { btbToday, isIsoDate } from "@/lib/btb-team";
import type { PlatformBootstrap, PlatformReadModule } from "@/lib/btb-platform";
import OperationsPanel, { type OperationsData } from "./OperationsPanel";
import NotificationsPanel, { type NotificationData } from "./NotificationsPanel";

const shiftDate = (date: string, days: number) =>
  new Date(Date.parse(`${date}T12:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);

export default function PlatformPage() {
  return <BtbFeatureGate feature="platform" wide>{(readOnly) => <LocationWorkspace readOnly={readOnly} />}</BtbFeatureGate>;
}

function LocationWorkspace({ readOnly }: { readOnly: boolean }) {
  const { identity } = useBtbWorkspace();
  const [module, setModule] = useState<PlatformReadModule>("operations");
  const [locationId, setLocationId] = useState("");
  const [date, setDate] = useState(() => btbToday());

  const bootstrap = useBtbData<PlatformBootstrap>("/api/btb/platform/bootstrap");
  const locations = useMemo(() => bootstrap.data?.locations ?? [], [bootstrap.data]);
  const active = locationId || locations[0]?.id || "";

  const read = useBtbData<OperationsData>(
    active && isIsoDate(date)
      ? `/api/btb/platform/read?module=operations&location=${active}&date=${date}`
      : null,
  );
  const inbox = useBtbData<NotificationData>(
    active ? `/api/btb/platform/read?module=notifications&location=${active}` : null,
  );

  const location = useMemo(() => locations.find((item) => item.id === active), [locations, active]);
  const personal = !!identity?.employeeId;

  return <div className="ops-workspace">
    <div className="btb-screen ops-workspace">
      <PageHeader
        title="Location workspace"
        subtitle="Opening, closing and cleaning duties, scheduled Celsius checks, sanitizer PPM and the record behind every day."
        action={location && <Badge accent="purple">{location.name}</Badge>}
      />
      {!personal && <IndividualLoginNotice next="/between-the-buns/platform" />}
      <section className="ops-shell" aria-label="Location controls">
        <div className="ops-toolbar">
          <div className="ops-toolbar-left">
            {locations.length > 1 ? (
              <label className="ops-inline-field">Location
                <select
                  className="ui-input"
                  value={active}
                  onChange={(event) => setLocationId(event.target.value)}
                >
                  {locations.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
                </select>
              </label>
            ) : locations.length === 1 ? (
              <p className="ops-meta"><MapPin size={14} aria-hidden="true" /> {locations[0].name}</p>
            ) : null}
            <nav className="ops-module-tabs" aria-label="Workspace module">
              <button type="button" aria-current={module === "operations" ? "page" : undefined} onClick={() => setModule("operations")}>
                <ClipboardList size={16} aria-hidden="true" /> Daily operations
              </button>
              <button type="button" aria-current={module === "notifications" ? "page" : undefined} onClick={() => setModule("notifications")}>
                <Info size={16} aria-hidden="true" /> Notifications
              </button>
            </nav>
          </div>
          <div className="ops-date-nav">
            <Button variant="ghost" aria-label="Previous day" onClick={() => setDate((current) => shiftDate(current, -1))}>
              <ChevronLeft size={18} aria-hidden="true" />
            </Button>
            <label className="ops-inline-field"><CalendarDays size={16} aria-hidden="true" />Business date
              <Input type="date" value={date} max={btbToday()} onChange={(event) => {
                if (isIsoDate(event.target.value)) setDate(event.target.value);
              }} />
            </label>
            <Button variant="ghost" aria-label="Next day" disabled={date >= btbToday()} onClick={() => setDate((current) => shiftDate(current, 1))}>
              <ChevronRight size={18} aria-hidden="true" />
            </Button>
            <Button variant="soft" onClick={() => setDate(btbToday())}>Today</Button>
          </div>
        </div>
        {location && !location.settings_confirmed && module === "operations" && (
          <div className="ui-notice ui-notice--warning">
            <Info size={18} aria-hidden="true" />
            <div>
              <strong>This location is not fully configured yet.</strong>
              <p>Confirm its timezone, report time, recipients, equipment, sanitizer standard and compliance types before relying on the daily record.</p>
            </div>
          </div>
        )}
      </section>
      <LoadState loading={bootstrap.loading} error={bootstrap.error} onRetry={bootstrap.reload} />
      {bootstrap.data && !locations.length && (
        <Card><div className="ui-empty">
          <MapPin size={28} aria-hidden="true" />
          <h2>No location access yet</h2>
          <p>Your account is signed in, but no BTB location has been assigned to you. Ask a manager or corporate administrator to add your membership.</p>
        </div></Card>
      )}
      {bootstrap.data && !!locations.length && (module === "operations"
        ? <OperationsPanel readOnly={readOnly || !personal} date={date} locationId={active} data={read.data} loading={read.loading} error={read.error} reload={read.reload} />
        : <NotificationsPanel data={inbox.data} loading={inbox.loading} error={inbox.error} reload={inbox.reload} />)}
    </div>
  </div>;
}
