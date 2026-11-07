"use client";

import { useMemo, useState } from "react";
import { BadgeCheck, Boxes, CalendarDays, ChevronLeft, ChevronRight, ClipboardList, FileText, Info, MapPin } from "lucide-react";
import BtbFeatureGate from "@/components/BtbFeatureGate";
import { Badge, Button, Card, Input, PageHeader } from "@/components/ui";
import { IndividualLoginNotice, LoadState } from "@/components/btb/Feedback";
import { useBtbData } from "@/components/btb/useBtbData";
import { useBtbWorkspace } from "@/contexts/BtbWorkspaceContext";
import { btbToday, isIsoDate } from "@/lib/btb-team";
import { platformCan, type PlatformBootstrap, type PlatformModule } from "@/lib/btb-platform";
import { btbMonth, isMonthKey, monthLabel, shiftMonth, type InventoryData } from "@/lib/btb-platform-inventory";
import OperationsPanel, { type OperationsData } from "./OperationsPanel";
import NotificationsPanel, { type NotificationData } from "./NotificationsPanel";
import InventoryPanel from "./InventoryPanel";
import ReportsPanel, { type ReportsData } from "./ReportsPanel";
import CompliancePanel, { type ComplianceData } from "./CompliancePanel";

const shiftDate = (date: string, days: number) =>
  new Date(Date.parse(`${date}T12:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);

export default function PlatformPage() {
  return <BtbFeatureGate feature="platform" wide>{(readOnly) => <LocationWorkspace readOnly={readOnly} />}</BtbFeatureGate>;
}

function LocationWorkspace({ readOnly }: { readOnly: boolean }) {
  const { identity } = useBtbWorkspace();
  const [module, setModule] = useState<PlatformModule>("operations");
  const [locationId, setLocationId] = useState("");
  const [date, setDate] = useState(() => btbToday());
  const [month, setMonth] = useState(() => btbMonth());

  const bootstrap = useBtbData<PlatformBootstrap>("/api/btb/platform/bootstrap");
  const locations = useMemo(() => bootstrap.data?.locations ?? [], [bootstrap.data]);
  const active = locationId || locations[0]?.id || "";
  const role = bootstrap.data?.identity.role ?? identity?.role ?? null;
  const modules = useMemo(
    () => (["operations", "inventory", "compliance", "reports", "notifications"] as PlatformModule[])
      .filter((item) => !role || platformCan(role, item)),
    [role],
  );

  const read = useBtbData<OperationsData>(
    module === "operations" && active && isIsoDate(date)
      ? `/api/btb/platform/read?module=operations&location=${active}&date=${date}`
      : null,
  );
  const inventory = useBtbData<InventoryData>(
    module === "inventory" && active && isMonthKey(month)
      ? `/api/btb/platform/read?module=inventory&location=${active}&month=${month}`
      : null,
  );
  const inbox = useBtbData<NotificationData>(
    module === "notifications" && active ? `/api/btb/platform/read?module=notifications&location=${active}` : null,
  );

  const compliance = useBtbData<ComplianceData>(
    module === "compliance" && active
      ? `/api/btb/platform/read?module=compliance&location=${active}`
      : null,
  );
  const reports = useBtbData<ReportsData>(
    module === "reports" && active && isIsoDate(date)
      ? `/api/btb/platform/read?module=reports&location=${active}&date=${date}`
      : null,
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
              {modules.includes("operations") && <button type="button" aria-current={module === "operations" ? "page" : undefined} onClick={() => setModule("operations")}>
                <ClipboardList size={16} aria-hidden="true" /> Daily operations
              </button>}
              {modules.includes("inventory") && <button type="button" aria-current={module === "inventory" ? "page" : undefined} onClick={() => setModule("inventory")}>
                <Boxes size={16} aria-hidden="true" /> Inventory &amp; food cost
              </button>}
              {modules.includes("compliance") && <button type="button" aria-current={module === "compliance" ? "page" : undefined} onClick={() => setModule("compliance")}>
                <BadgeCheck size={16} aria-hidden="true" /> Compliance
              </button>}
              {modules.includes("reports") && <button type="button" aria-current={module === "reports" ? "page" : undefined} onClick={() => setModule("reports")}>
                <FileText size={16} aria-hidden="true" /> Reports &amp; delivery
              </button>}
              {modules.includes("notifications") && <button type="button" aria-current={module === "notifications" ? "page" : undefined} onClick={() => setModule("notifications")}>
                <Info size={16} aria-hidden="true" /> Notifications
              </button>}
            </nav>
          </div>
          {module === "inventory" ? (
            <LocationNav
              location={location}
              month={month}
              onPrev={() => setMonth((current) => shiftMonth(current, -1))}
              onNext={() => setMonth((current) => shiftMonth(current, 1))}
              onCurrent={() => setMonth(btbMonth())}
            />
          ) : (
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
          )}
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
      {bootstrap.data && !!locations.length && role && (
        module === "operations"
          ? <OperationsPanel readOnly={readOnly || !personal} date={date} locationId={active} data={read.data} loading={read.loading} error={read.error} reload={read.reload} />
          : module === "inventory"
            ? <InventoryPanel
                key={`${active}:${month}`}
                locationId={active}
                month={month}
                data={inventory.data}
                loading={inventory.loading}
                error={inventory.error}
                reload={inventory.reload}
              />
            : module === "compliance"
              ? <CompliancePanel locationId={active} data={compliance.data} loading={compliance.loading} error={compliance.error} reload={compliance.reload} />
              : module === "reports"
              ? <ReportsPanel date={date} locationId={active} data={reports.data} loading={reports.loading} error={reports.error} reload={reports.reload} />
              : <NotificationsPanel data={inbox.data} loading={inbox.loading} error={inbox.error} reload={inbox.reload} />
      )}
    </div>
  </div>;
}

function LocationNav({ location, month, onPrev, onNext, onCurrent }: {
  location: { name: string } | undefined;
  month: string;
  onPrev: () => void;
  onNext: () => void;
  onCurrent: () => void;
}) {
  return <div className="ops-date-nav">
    <Button variant="ghost" aria-label="Previous month" onClick={onPrev}>
      <ChevronLeft size={18} aria-hidden="true" />
    </Button>
    <p className="ops-inline-field"><CalendarDays size={16} aria-hidden="true" />
      <span>Accounting month</span>
      <strong>{monthLabel(month)}</strong>
      {location && <span className="ops-meta">· {location.name}</span>}
    </p>
    <Button variant="ghost" aria-label="Next month" onClick={onNext}>
      <ChevronRight size={18} aria-hidden="true" />
    </Button>
    <Button variant="soft" onClick={onCurrent}>This month</Button>
  </div>;
}
