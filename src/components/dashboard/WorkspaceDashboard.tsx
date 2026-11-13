"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { ArrowRight, CheckCheck, ChevronRight, CircleAlert, Clock3, MapPin, RefreshCw, Search, SearchX, ShieldCheck, Sparkles, WifiOff, X } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/lib/supabase";
import RecentlyUsed from "@/components/RecentlyUsed";
import { ROLES, isRole, roleLabel, type Role } from "@/lib/roles";
import { DASHBOARD_VIEWS, METRICS, attentionFor, dayKey, isGroupRole, metricScope, metricsForRole, type DashboardContext, type DashboardScope, type MetricId } from "@/lib/dashboard";
import { loadDashboard, loadLocationPulse, type DashboardResult, type LocationPulse } from "@/lib/dashboard-data";
import { workspaceNavForRole } from "@/lib/workspace-nav";
import { NavIcon } from "@/components/admin/NavIcon";

function subscribeToConnection(callback: () => void) {
  window.addEventListener("online", callback);
  window.addEventListener("offline", callback);
  return () => { window.removeEventListener("online", callback); window.removeEventListener("offline", callback); };
}

export default function WorkspaceDashboard() {
  const { user, role, profileLoading } = useAuth();
  if (!user || profileLoading || !isRole(role)) return <div className="workspace-loading" role="status"><span className="ui-loader" />Loading your overview…</div>;
  return <DashboardBody key={`${user.id}:${role}`} role={role} userId={user.id} />;
}

function DashboardBody({ role, userId }: { role: Role; userId: string }) {
  const { displayName, restaurantName, locations, locationId, setLocationId, locationsError, reloadProfile } = useAuth();
  const groupRole = isGroupRole(role);
  const [scope, setScope] = useState<DashboardScope>(groupRole ? "group" : "location");
  const [refresh, setRefresh] = useState(0);
  const [query, setQuery] = useState("");
  const [snapshot, setSnapshot] = useState<{ key: string; result: DashboardResult; pulse: LocationPulse[] } | null>(null);
  const online = useSyncExternalStore(subscribeToConnection, () => navigator.onLine, () => true);
  const view = DASHBOARD_VIEWS[role];
  const context = useMemo<DashboardContext>(() => {
    const sites = scope === "group" && groupRole ? locations : locations.filter((site) => site.id === locationId);
    return { role, userId, locationIds: sites.map((site) => site.id), restaurantName };
  }, [role, userId, scope, groupRole, locations, locationId, restaurantName]);
  const requestKey = JSON.stringify([context, refresh]);
  const loaded = snapshot?.key === requestKey;
  const result = loaded ? snapshot.result : null;
  const values = { ...result?.values, locations: locationsError ? null : locations.length };
  const activeSite = locations.find((site) => site.id === locationId);
  const usesLocations = role !== "staff" && role !== "designer";
  const scopeLabel = role === "staff" ? "Your personal records" : role === "designer" ? restaurantName || "Your marketing workspace" : locationsError ? "Locations unavailable" : scope === "group" ? "All accessible locations" : activeSite?.name || "No location assigned";
  const unavailable = result ? metricsForRole(role).filter((id) => values[id] == null) : [];
  const attention = attentionFor(role, values);
  const groups = workspaceNavForRole(role).filter((group) => group.label !== "Workspace");
  const terms = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const filteredGroups = groups.map((group) => ({
    ...group,
    items: group.items.filter((item) => terms.every((term) => `${item.label} ${item.keywords ?? ""} ${group.label}`.toLowerCase().includes(term))),
  })).filter((group) => group.items.length > 0);

  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 15_000);
    const now = new Date();
    void Promise.all([
      loadDashboard(supabase, context, now, controller.signal),
      groupRole ? loadLocationPulse(supabase, context, locations, now, controller.signal) : Promise.resolve([]),
    ]).then(([data, pulse]) => {
      if (!cancelled) setSnapshot({ key: requestKey, result: data, pulse });
    }).catch(() => {
      if (!cancelled) setSnapshot({ key: requestKey, result: { values: {}, activity: [], activityUnavailable: true, updatedAt: new Date().toISOString() }, pulse: [] });
    }).finally(() => window.clearTimeout(timeout));
    return () => { cancelled = true; controller.abort(); window.clearTimeout(timeout); };
  }, [context, requestKey, groupRole, locations]);

  useEffect(() => {
    const update = () => setRefresh((value) => value + 1);
    window.addEventListener("online", update);
    return () => window.removeEventListener("online", update);
  }, []);

  const inspectSite = (id: string) => {
    setLocationId(id);
    setScope("location");
    document.getElementById("dashboard-heading")?.focus();
    window.scrollTo({ top: 0, behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth" });
  };

  return (
    <div className="dash" data-role={role}>
      <RecentlyUsed />
      <header className="dash__heading">
        <div>
          <p className="dash__eyebrow">{roleLabel(role)} overview <span aria-hidden="true" /> {new Date().toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" })}</p>
          <h1 id="dashboard-heading" tabIndex={-1}>{view.title}</h1>
          <p className="dash__intro">{view.subtitle}</p>
        </div>
        <div className="dash__heading-actions">
          <Link className="ui-button ui-button--ghost" href={view.secondary.href}>{view.secondary.label}</Link>
          <Link className="ui-button" href={view.primary.href}>{view.primary.label}<ArrowRight size={16} aria-hidden="true" /></Link>
        </div>
      </header>

      <div className="dash__toolbar">
        {groupRole && <div className="dash__segmented" role="group" aria-label="Dashboard scope">
          <button aria-pressed={scope === "group"} onClick={() => setScope("group")}>All locations</button>
          <button aria-pressed={scope === "location"} onClick={() => setScope("location")}>One location</button>
        </div>}
        {usesLocations && scope === "location" && locations.length > 1 ? (
          <label className="location-picker"><MapPin size={15} aria-hidden="true" /><span className="sr-only">Dashboard location</span><select value={locationId ?? ""} onChange={(event) => setLocationId(event.target.value)}>{locations.map((site) => <option key={site.id} value={site.id}>{site.name}</option>)}</select></label>
        ) : <span className="dash__scope"><MapPin size={15} aria-hidden="true" />{scopeLabel}</span>}
        <div className="dash__toolbar-right">
          <span className="dash__updated" role="status">{!online ? "You’re offline" : !loaded ? "Updating your overview…" : `${unavailable.length || result?.activityUnavailable ? "Partially updated" : "Updated"} ${new Date(result!.updatedAt).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}`}</span>
          <button className="dash__refresh" disabled={!loaded} aria-label="Refresh dashboard" aria-busy={!loaded} onClick={() => setRefresh((value) => value + 1)}><RefreshCw size={17} aria-hidden="true" /></button>
        </div>
      </div>

      {!online && <div className="ui-notice ui-notice--warning" role="status"><WifiOff size={18} /><span>Your connection is offline. Reconnect to refresh these records.</span></div>}
      {usesLocations && locationsError && <div className="ui-notice ui-notice--warning" role="status"><MapPin size={18} /><span>{locationsError} <button onClick={reloadProfile}>Retry locations</button></span></div>}
      {unavailable.length > 0 && <div className="ui-notice ui-notice--warning" role="status"><CircleAlert size={18} /><div><strong>Some records couldn’t be loaded.</strong> {unavailable.map((id) => METRICS[id].label).join(", ")} {unavailable.length === 1 ? "is" : "are"} unavailable. <button onClick={() => setRefresh((value) => value + 1)}>Try again</button></div></div>}

      <section className="dash__metrics" aria-label="Key figures" aria-busy={!loaded}>
        {view.metrics.map((id) => <MetricCard key={id} id={id} role={role} value={values[id]} loading={!loaded && id !== "locations"} scopeLabel={id === "locations" ? "Your assigned sites" : role === "staff" || metricScope(id) === "personal" ? "Your records" : metricScope(id) === "restaurant" ? restaurantName || "Restaurant unavailable" : scopeLabel} />)}
      </section>

      <div className="dash__columns">
        <section className="dash-panel" aria-labelledby="attention-title">
          <div className="dash-panel__header"><div><h2 id="attention-title">{role === "designer" ? "On your radar" : "Needs attention"}</h2><p>{role === "designer" ? "The next steps for your campaigns." : "A short list. A clear next step."}</p></div><span className="dash-panel__count" aria-label={`${attention.length} priority areas`}>{loaded ? attention.length : "—"}</span></div>
          {!loaded ? <div className="ui-empty" role="status"><span className="ui-loader" /><p>Checking your records…</p></div> : attention.length > 0 ? attention.map((item) => (
            <Link href={item.href} key={item.id} className="dash-priority">
              <span className={`ui-icon ui-tone--${item.tone === "danger" ? "red" : "amber"}`}><NavIcon name={item.icon} size={18} /></span>
              <span className="dash-priority__body"><strong>{item.title}</strong><p>{item.description}</p></span>
              <span className="dash-priority__number">{item.count}</span><ChevronRight size={16} aria-hidden="true" />
            </Link>
          )) : <div className="ui-empty">
            {unavailable.length ? <CircleAlert size={28} /> : <CheckCheck size={30} />}
            <h3>{unavailable.length ? "Your briefing is incomplete" : "No flagged items in these records"}</h3>
            <p>{unavailable.length ? "Refresh the unavailable sources to complete your overview." : "Keep recording your work. New exceptions and upcoming renewals will appear here."}</p>
            <Link className="ui-button ui-button--ghost" href={view.primary.href}>{view.primary.label}<ArrowRight size={15} /></Link>
          </div>}
        </section>

        <div className="dash__side">
          <section className="dash-focus">
            <div className="dash-focus__label"><Sparkles size={16} aria-hidden="true" />A little focus for today</div>
            <h2>{view.focusTitle}</h2><p>{view.focusBody}</p>
            <Link className="ui-button" href={view.primary.href}>{view.primary.label}<ArrowRight size={16} aria-hidden="true" /></Link>
            <div className="dash-focus__rule"><ShieldCheck size={14} aria-hidden="true" />Your {roleLabel(role).toLowerCase()} workspace</div>
          </section>
        </div>
      </div>

      {groupRole && <section id="location-pulse" className="dash-panel" aria-labelledby="locations-title">
        <div className="dash-panel__header"><div><h2 id="locations-title">Location pulse</h2><p>Compare site-linked records. Open a location to focus your overview.</p></div><span className="ui-badge">{locationsError ? "Unavailable" : `${locations.length} ${locations.length === 1 ? "location" : "locations"}`}</span></div>
        {locations.length === 0 ? <div className="ui-empty"><MapPin size={28} /><h3>{locationsError ? "Location records unavailable" : "No locations are assigned yet"}</h3><p>{locationsError ? "Retry to load your sites and compare their records." : "Your assigned locations will appear here."}</p>{locationsError && <button className="ui-button ui-button--ghost" onClick={reloadProfile}>Retry locations</button>}</div> : !loaded ? <div className="ui-empty" role="status"><span className="ui-loader" /><p>Comparing locations…</p></div> : <div className="dash-locations"><table>
          <caption className="sr-only">Flagged temperatures in seven days, renewals within thirty days including overdue, and unresolved actions by location</caption>
          <thead><tr><th scope="col">Location</th><th scope="col">Flagged temperatures</th><th scope="col">Renewals</th><th scope="col">Open actions</th><th scope="col"><span className="sr-only">Open location</span></th></tr></thead>
          <tbody>{locations.map((site) => {
            const pulse = snapshot?.pulse.find((row) => row.id === site.id);
            return <tr key={site.id}><td><strong>{site.name}</strong><small>{site.address || "Assigned location"}</small></td>{(["temperatureAlerts", "renewals", "openActions"] as const).map((id) => <td key={id}>{pulse?.values[id] == null ? <span title="Data unavailable">Unavailable</span> : <span className={`ui-badge ${pulse.values[id]! > 0 ? "ui-tone--amber" : ""}`}>{pulse.values[id]}</span>}</td>)}<td><button onClick={() => inspectSite(site.id)} aria-label={`Open ${site.name}`}>Open<ArrowRight size={14} aria-hidden="true" /></button></td></tr>;
          })}</tbody>
        </table></div>}
      </section>}

      <div className="dash__columns">
        <section id="workspace-tools" aria-labelledby="tools-title">
          <div className="dash-section__head"><div><h2 id="tools-title">Your workspace</h2><p>Everything you need, a little easier to find.</p></div></div>
          <label className="dash-search"><Search size={17} aria-hidden="true" /><span className="sr-only">Search workspace tools</span><input type="search" value={query} placeholder="Search tools, records, tasks…" onChange={(event) => setQuery(event.target.value)} />{query && <button onClick={() => setQuery("")} aria-label="Clear tool search"><X size={15} /></button>}</label>
          <div className="dash-directory dash-directory--compact">
            {filteredGroups.map((group) => <section className="dash-directory__group" key={group.label}><h3>{group.label}</h3>{group.items.map((item) => <Link className="dash-directory__link" href={item.href} key={item.href}><NavIcon name={item.icon} size={17} /><span>{item.label}</span><ChevronRight size={13} aria-hidden="true" /></Link>)}{group.label === "Connected workspace" && <small>BTB uses its own staff sign-in.</small>}</section>)}
          </div>
          {filteredGroups.length === 0 && <div className="ui-empty" role="status"><SearchX size={28} /><h3>No tools match “{query}”</h3><p>Try a different name, or clear the search to see your tools.</p><button className="ui-button ui-button--ghost" onClick={() => setQuery("")}>Clear search</button></div>}
        </section>

        <section className="dash-panel" aria-labelledby="activity-title">
          <div className="dash-panel__header"><div><h2 id="activity-title">Recently recorded</h2><p>Latest visible records · past 7 days</p></div><Clock3 size={17} color="var(--muted)" aria-hidden="true" /></div>
          {!loaded ? <div className="ui-empty" role="status"><span className="ui-loader" /><p>Loading recent records…</p></div> : <>
            {result?.activityUnavailable && <p className="dash-feed__notice">Some recent records are unavailable. Refresh to try again.</p>}
            {result?.activity.length ? <ol className="dash-feed">{result.activity.map((item) => <li className="dash-feed__item" key={item.id}><span className="dash-feed__icon"><NavIcon name={item.icon} size={15} /></span><div className="dash-feed__body"><Link href={item.href}>{item.title}</Link><p>{item.detail}</p><time dateTime={item.at}>{recordedTime(item.at)}</time></div></li>)}</ol> : <div className="ui-empty"><Clock3 size={28} /><h3>{result?.activityUnavailable ? "Recent records unavailable" : "Your next record starts the story"}</h3><p>{result?.activityUnavailable ? "Use your tools directly while this feed reconnects." : "Saved work from this week will appear here."}</p></div>}
          </>}
        </section>
      </div>

      <details className="dash-roles">
        <summary>One platform. A clear view for every role.</summary>
        <p className="dash-roles__intro">Hello{displayName ? `, ${displayName.split(" ")[0]}` : ""}. Your overview follows your assigned role. Here’s how the responsibilities differ.</p>
        <div className="dash-roles__grid">{ROLES.map((item) => <div key={item} className="dash-roles__item" data-current={item === role}><strong>{roleLabel(item)}</strong>{item === role && <span>Your view</span>}<p>{DASHBOARD_VIEWS[item].responsibility}</p></div>)}</div>
      </details>
      <p className="dash__provenance">Figures reflect records your account can access. Site comparisons use location-linked records. Business registers follow your profile’s restaurant, and personal records are labelled as yours. An unavailable figure is shown as “—”.</p>
    </div>
  );
}

function MetricCard({ id, value, loading, role, scopeLabel }: { id: MetricId; value: number | null | undefined; loading: boolean; role: Role; scopeLabel: string }) {
  const definition = METRICS[id];
  const missing = !loading && value == null;
  const tone = missing ? "unavailable" : value && definition.attention ? definition.attention.tone : "neutral";
  const href = id === "inspectionsMonth" && role === "corporate" ? "/admin/inspections/corporate" : definition.href;
  return <Link href={href} className="dash-metric" data-tone={tone} aria-label={`${definition.label}: ${loading ? "loading" : missing ? "unavailable" : value}`}>
    <span className="dash-metric__top">{definition.label}<span className="dash-metric__icon"><NavIcon name={definition.icon} size={16} /></span></span>
    <span className="dash-metric__value">{loading ? <span className="ui-skeleton" aria-hidden="true" /> : missing ? "—" : value!.toLocaleString()}</span>
    <span className="dash-metric__foot">{missing ? <><CircleAlert size={12} />Data unavailable</> : definition.detail}</span>
    <span className="dash-metric__scope">{scopeLabel}</span>
  </Link>;
}

function recordedTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Recorded recently";
  const time = date.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
  return dayKey(date) === dayKey(new Date()) ? `Today, ${time}` : `${date.toLocaleDateString("en-GB", { day: "numeric", month: "short" })}, ${time}`;
}
