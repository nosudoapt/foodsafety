"use client";

import { useState } from "react";
import { RefreshCw } from "lucide-react";
import { Button, Card, TabList } from "@/components/ui";
import { LoadState } from "@/components/btb/Feedback";
import type { FinanceData } from "@/lib/btb-finance";
import InvoicesPanel from "./InvoicesPanel";
import StockPanel from "./StockPanel";
import GstPanel from "./GstPanel";
import BankPanel from "./BankPanel";

const TABS = [{ id: "invoices", label: "Invoices" }, { id: "stock", label: "Stock & prices" }, { id: "gst", label: "GST" }, { id: "bank", label: "Bank reconciliation" }] as const;
type Tab = (typeof TABS)[number]["id"];
export default function FinancePanel({ locationId, data, loading, error, reload, canWrite, today, timezone }: {
  locationId: string; data: FinanceData | null; loading: boolean; error: string;
  reload: () => void; canWrite: boolean; today: string; timezone: string;
}) {
  const [tab, setTab] = useState<Tab>("invoices");
  return <section className="ops-panel finance-workspace" aria-label="Finance and stock">
    <div className="ops-toolbar"><div><h2 className="ops-section-title">Finance &amp; stock</h2><p className="ops-meta">Approved invoices drive stock receipts, supplier prices, invoice balances and purchase GST. Nothing is matched or filed automatically.</p></div><Button variant="ghost" onClick={reload}><RefreshCw size={16} aria-hidden="true" />Refresh finance</Button></div>
    {!canWrite && <p className="ui-notice">Read-only oversight. Managers and owners review and approve finance changes.</p>}
    <LoadState loading={loading} error={error} onRetry={reload} />
    {data && <>
      <TabList id="finance" label="Finance view" tabs={TABS} value={tab} onChange={setTab} />
      {TABS.map(({ id }) => <div key={id} hidden={tab !== id} role="tabpanel" id={`finance-panel-${id}`} aria-labelledby={`finance-tab-${id}`} tabIndex={0} className="ops-panel">
        {id === "invoices" && <InvoicesPanel locationId={locationId} data={data} canWrite={canWrite} today={today} reload={reload} />}
        {id === "stock" && <StockPanel locationId={locationId} data={data} canWrite={canWrite} timezone={timezone} reload={reload} />}
        {id === "gst" && <GstPanel locationId={locationId} data={data} canWrite={canWrite} reload={reload} />}
        {id === "bank" && <BankPanel locationId={locationId} data={data} canWrite={canWrite} reload={reload} />}
      </div>)}
      <Card><details className="ops-panel"><summary>Finance audit history · {data.audit.length} events</summary>{data.audit.length ? <ol className="finance-audit">{data.audit.slice(0, 100).map((event) => <li key={event.id}><strong>{event.action.replaceAll("_", " ")}</strong> · {event.entity_type.replaceAll("_", " ")} · {event.actor_name}<p className="ops-meta">{new Date(event.created_at).toLocaleString("en-CA", { timeZone: timezone })}{event.reason ? ` · ${event.reason}` : ""}</p></li>)}</ol> : <p className="ui-empty">No finance changes yet.</p>}{data.audit.length > 100 && <p className="ops-meta">Showing the latest 100 events. Older events remain in the database audit record.</p>}</details></Card>
    </>}
  </section>;
}
