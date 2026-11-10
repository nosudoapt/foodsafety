"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ArrowRight, CheckCheck, ChevronRight, CircleAlert, Eye, LayoutGrid, RefreshCw, Search, SearchX, Sparkles, X } from "lucide-react";
import { NavCard } from "@/components/ui";
import BtbIcon, { BTB_ICONS } from "@/components/BtbIcon";
import { useBtbWorkspace } from "@/contexts/BtbWorkspaceContext";
import { BTB_DASHBOARD_VIEWS, BTB_METRICS, btbCardGroup, btbMetricIds, btbAccessSummary, searchBtbCards, type BtbOverview } from "@/lib/btb-dashboard";
import { accessibleBtbCards, pageSlug, BTB_MANAGED_ROLES } from "@/lib/btb-page-access";
import { BTB_ROLE_LABELS, BTB_ROLES, type BtbRole } from "@/lib/btb-roles";
import { btbCanEdit } from "@/lib/btb-access";
import { btbToday } from "@/lib/btb-team";
import { fetchJson } from "@/lib/fetch-json";
import TrainingDashboardPanel from "@/components/btb/TrainingProgress";

export default function BtbHub({ role: initialRole }: { role: BtbRole }) {
  const { identity, rows } = useBtbWorkspace();
  const role = identity?.role ?? initialRole;
  return <HubBody key={role} role={role} rows={rows} />;
}

function HubBody({ role, rows }: { role: BtbRole; rows: ReturnType<typeof useBtbWorkspace>["rows"] }) {
  const view = BTB_DASHBOARD_VIEWS[role];
  const cards = accessibleBtbCards(role, rows).filter((card) => card.hub !== false);
  const [query, setQuery] = useState("");
  const [revision, setRevision] = useState(0);
  const [snapshot, setSnapshot] = useState<{ revision: number; data: BtbOverview | null; error: string } | null>(null);
  const loaded = snapshot?.revision === revision;
  const result = loaded ? snapshot.data : null;
  const overviewDay = result?.day ?? btbToday();
  const error = loaded ? snapshot.error : "";
  const availableIds = rows ? btbMetricIds(role, rows) : [];
  const staticValues = rows ? btbAccessSummary(role, rows) : {};
  const values = { ...result?.values, ...staticValues };
  const metricIds = view.metrics.filter((id) => availableIds.includes(id));
  const missing = loaded ? availableIds.filter((id) => values[id] == null) : [];
  const attention = view.attention.filter((id) => typeof values[id] === "number" && Number(values[id]) > 0);
  const quick = view.quick.flatMap((page) => cards.filter((card) => pageSlug(card) === page));
  const primary = quick[0];
  const matches = searchBtbCards(role, rows, query);
  const groups = [...new Set(matches.map(btbCardGroup))];

  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 12_000);
    void fetchJson<BtbOverview>(`/api/btb/overview?day=${btbToday()}`, { signal: controller.signal })
      .then((data) => { if (!cancelled) setSnapshot({ revision, data, error: "" }); })
      .catch(() => { if (!cancelled) setSnapshot({ revision, data: null, error: "Your overview couldn’t be loaded. Your available tools are below." }); })
      .finally(() => window.clearTimeout(timeout));
    return () => { cancelled = true; controller.abort(); window.clearTimeout(timeout); };
  }, [revision]);

  return <div className="dash btb-overview" data-role={role}>
    <header className="dash__heading"><div><p className="dash__eyebrow">{BTB_ROLE_LABELS[role]} overview<span aria-hidden="true" /><time dateTime={overviewDay}>{new Date(`${overviewDay}T12:00:00Z`).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" })}</time></p><h1>{view.title}</h1><p className="dash__intro">{view.subtitle}</p></div><div className="dash__heading-actions"><a className="ui-button ui-button--ghost" href="#btb-tools">Explore your tools</a>{primary && <Link className="ui-button" href={primary.href}>{primary.title}<ArrowRight size={16} aria-hidden="true" /></Link>}</div></header>
    <div className="dash__toolbar"><span className="dash__scope"><span className="btb-subnav__dot" aria-hidden="true" />Between the Buns · saved workspace records</span><div className="dash__toolbar-right"><span className="dash__updated" role="status">{!loaded ? "Updating your overview…" : error || missing.length ? "Some records are unavailable" : `Updated ${new Date(result!.updatedAt).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}`}</span><button className="dash__refresh" aria-label="Refresh overview" aria-busy={!loaded} disabled={!loaded} onClick={() => setRevision((value) => value + 1)}><RefreshCw size={17} aria-hidden="true" /></button></div></div>
    {(error || missing.length > 0) && <div className="ui-notice ui-notice--warning" role="status"><CircleAlert size={18} aria-hidden="true" /><div>{error || "Some counts are unavailable. Refresh to complete your overview."} <button onClick={() => setRevision((value) => value + 1)}>Try again</button></div></div>}
    {metricIds.length > 0 && <section className="dash__metrics" aria-label="Key figures" aria-busy={!loaded}>{metricIds.map((id) => {
      const metric = BTB_METRICS[id];
      const card = cards.find((item) => pageSlug(item) === metric.page);
      const value = values[id];
      const pending = !loaded && staticValues[id] == null;
      const unavailable = !pending && value == null;
      return <Link key={id} className="dash-metric" href={card?.href ?? (role === "admin" ? "/between-the-buns/admin" : "#btb-tools")} data-tone={unavailable ? "unavailable" : metric.attention && Number(value) > 0 ? "warning" : "neutral"} aria-label={`${metric.label}: ${pending ? "loading" : unavailable ? "unavailable" : value}`}><span className="dash-metric__top">{metric.label}<span className="dash-metric__icon">{card ? <BtbIcon name={card.iconKey} size={16} /> : <LayoutGrid size={16} aria-hidden="true" />}</span></span><span className={`dash-metric__value ${typeof value === "string" ? "dash-metric__value--text" : ""}`}>{pending ? <span className="ui-skeleton" aria-hidden="true" /> : unavailable ? "—" : typeof value === "number" ? value.toLocaleString() : value}</span><span className="dash-metric__foot">{unavailable ? "Data unavailable" : id === "inventoryStatus" && result ? `${result.inventoryMonth} · ${metric.detail}` : metric.detail}</span></Link>;
    })}</section>}

    {["manager", "supervisor", "corporate"].includes(role) && cards.some((card) => card.feature === "training_guide") && <TrainingDashboardPanel key={revision} />}

    <div className="dash__columns">
      <section className="dash-panel" aria-labelledby="btb-priorities"><div className="dash-panel__header"><div><h2 id="btb-priorities">{role === "admin" ? "Access at a glance" : "Needs attention"}</h2><p>{role === "admin" ? "Available pages for each operational role." : "The saved records worth a closer look."}</p></div><span className="dash-panel__count">{role === "admin" ? 4 : loaded ? attention.length : "—"}</span></div>
        {role === "admin" ? BTB_MANAGED_ROLES.map((item) => <Link href="/between-the-buns/admin" className="dash-priority" key={item}><span className="ui-icon ui-tone--purple"><LayoutGrid size={18} aria-hidden="true" /></span><span className="dash-priority__body"><strong>{BTB_ROLE_LABELS[item]}</strong><p>{rows ? `${accessibleBtbCards(item, rows).length} pages available` : "Access settings unavailable"}</p></span><ChevronRight size={16} aria-hidden="true" /></Link>) : !loaded ? <div className="ui-empty" role="status"><span className="ui-loader" aria-hidden="true" /><p>Checking saved records…</p></div> : attention.length ? attention.map((id) => {
          const metric = BTB_METRICS[id];
          const card = cards.find((item) => pageSlug(item) === metric.page)!;
          return <Link key={id} href={card.href} className="dash-priority"><span className="ui-icon ui-tone--amber"><BtbIcon name={card.iconKey} size={18} /></span><span className="dash-priority__body"><strong>{metric.attention}</strong><p>{metric.detail}</p></span><span className="dash-priority__number">{values[id]}</span><ChevronRight size={16} aria-hidden="true" /></Link>;
        }) : <div className="ui-empty">{missing.length ? <CircleAlert size={28} /> : <CheckCheck size={28} />}<h3>{missing.length ? "Your briefing is incomplete" : "No flagged items in these records"}</h3><p>{missing.length ? "Refresh the unavailable sources, or open a tool below." : "Keep recording shift work and updating renewals. Saved exceptions will appear here."}</p></div>}
      </section>
      <section className="dash-focus"><p className="dash-focus__label"><Sparkles size={16} aria-hidden="true" />Your focus, today</p><h2>{view.focusTitle}</h2><p>{view.focusBody}</p>{primary && <Link className="ui-button" href={primary.href}>{primary.title}<ArrowRight size={16} aria-hidden="true" /></Link>}<div className="dash-focus__rule">Built around your {BTB_ROLE_LABELS[role].toLowerCase()} responsibilities.</div></section>
    </div>

    {quick.length > 1 && <section aria-labelledby="btb-quick"><div className="dash-section__head"><div><h2 id="btb-quick">Your next move</h2><p>The everyday tools for your role.</p></div></div><div className="btb-quick">{quick.map((card) => <Link key={card.href} href={card.href}><span className="ui-icon ui-tone--purple"><BtbIcon name={card.iconKey} /></span><span><strong>{card.title}</strong><small>{card.feature === "training_guide" && role !== "corporate" ? "Learn & track progress" : btbCanEdit(card.feature, role) ? "Open & update" : "Open read-only"}</small></span><ArrowRight size={17} aria-hidden="true" /></Link>)}</div></section>}

    <section id="btb-tools" aria-labelledby="btb-tools-title"><div className="dash-section__head"><div><h2 id="btb-tools-title">Your workspace tools</h2><p>{cards.length} available {cards.length === 1 ? "page" : "pages"}, organised around the work.</p></div><label className="dash-search"><Search size={17} aria-hidden="true" /><span className="sr-only">Search BTB tools</span><input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search recipes, stock, people…" />{query && <button onClick={() => setQuery("")} aria-label="Clear tool search"><X size={15} /></button>}</label></div>
      {groups.map((group) => <section className="btb-toolgroup" key={group}><h3>{group}</h3><div className="btb-tools">{matches.filter((card) => btbCardGroup(card) === group).map((card) => <div className="btb-tool" key={card.href}><NavCard href={card.href} title={card.title} desc={card.desc} icon={BTB_ICONS[card.iconKey]} accent="purple" />{!btbCanEdit(card.feature, role) && <span className="btb-tool__mode"><Eye size={12} aria-hidden="true" />{card.feature === "training_guide" && role !== "corporate" ? "Learn & submit" : "Read-only"}</span>}</div>)}</div></section>)}
      {!matches.length && <div className="ui-empty" role="status"><SearchX size={28} /><h3>{query ? `No tools match “${query}”` : "No tools are enabled yet"}</h3><p>{query ? "Try a different name or clear your search." : "Your administrator can review page availability for this role."}</p>{query && <button className="ui-button ui-button--ghost" onClick={() => setQuery("")}>Clear search</button>}</div>}
    </section>
    <details className="dash-roles"><summary>One workspace. A different focus for every role.</summary><div className="dash-roles__grid">{BTB_ROLES.map((item) => <div className="dash-roles__item" key={item} data-current={item === role}><strong>{BTB_ROLE_LABELS[item]}</strong>{item === role && <span>Your view</span>}<p>{BTB_DASHBOARD_VIEWS[item].responsibility}</p></div>)}</div></details>
    <p className="dash__provenance">Figures reflect saved Between the Buns records and the pages enabled for your role. An unavailable figure appears as “—”. The inventory tile shows the previous calendar month’s saved status.</p>
  </div>;
}
