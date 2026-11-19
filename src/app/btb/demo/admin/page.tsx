"use client";

import { useState } from "react";
import { Check, CircleAlert, Eye, LockKeyhole, Save, Search } from "lucide-react";
import BtbFeatureGate from "@/components/BtbFeatureGate";
import BtbIcon from "@/components/BtbIcon";
import { PageHeader } from "@/components/ui";
import { useBtbWorkspace } from "@/contexts/BtbWorkspaceContext";
import { BTB_CARDS } from "@/lib/btb-hub";
import { btbCanEdit, btbCanView } from "@/lib/btb-access";
import { BTB_MANAGED_ROLES, btbPageAllowed, pageSlug, type BtbPageAccess } from "@/lib/btb-page-access";
import { BTB_ROLE_LABELS } from "@/lib/btb-roles";
import { BTB_DASHBOARD_VIEWS } from "@/lib/btb-dashboard";
import { fetchJson } from "@/lib/fetch-json";

export default function AdminDashboard() {
  return <BtbFeatureGate feature="admin_dashboard" wide>{() => <AccessEditor />}</BtbFeatureGate>;
}

function AccessEditor() {
  const { rows, accessError, reload } = useBtbWorkspace();
  if (!rows) return <div className="btb-access"><PageHeader title="Role & page access" subtitle="Give each role the tools it needs." /><div className="ui-empty"><CircleAlert size={28} /><h2>Access settings are unavailable</h2><p role="alert">{accessError}</p><button className="ui-button" onClick={reload}>Try again</button></div></div>;
  return <PermissionsEditor initialRows={rows} />;
}

function PermissionsEditor({ initialRows }: { initialRows: BtbPageAccess[] }) {
  const [rows, setRows] = useState(initialRows);
  const [selectedRole, setSelectedRole] = useState<(typeof BTB_MANAGED_ROLES)[number]>("staff");
  const [edits, setEdits] = useState<Record<string, BtbPageAccess>>({});
  const [query, setQuery] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
  const changes = Object.values(edits);
  const effective = rows.filter((row) => !edits[`${row.role}:${row.page}`]).concat(changes);
  const cards = BTB_CARDS.filter((card) => card.feature !== "admin_dashboard" && `${card.title} ${card.desc}`.toLowerCase().includes(query.trim().toLowerCase()));

  const save = async () => {
    if (!changes.length || saving) return;
    setSaving(true);
    setError("");
    setSaved(false);
    try {
      const response = await fetchJson<{ ok: boolean }>("/api/btb/role-page-access", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ rows: changes }) });
      if (!response.ok) throw new Error("Save not confirmed");
      setRows(effective);
      setEdits({});
      setSaved(true);
    } catch {
      setError("Changes weren’t saved. Your selections are still here — try saving again.");
    } finally { setSaving(false); }
  };

  return <div className="btb-access">
    <PageHeader title="Role & page access" subtitle="Choose which eligible pages appear for each role. Updates take effect after saving." />
    <div className="btb-access__roles" role="group" aria-label="Role to configure">{BTB_MANAGED_ROLES.map((role) => <button key={role} aria-pressed={selectedRole === role} onClick={() => setSelectedRole(role)}><strong>{BTB_ROLE_LABELS[role]}</strong><span>{BTB_CARDS.filter((card) => btbPageAllowed(card, role, effective)).length} pages available</span></button>)}</div>
    <div className="btb-access__intro"><h2>{BTB_ROLE_LABELS[selectedRole]} workspace</h2><p>{BTB_DASHBOARD_VIEWS[selectedRole].responsibility}</p></div>
    <div className="btb-access__toolbar"><label className="dash-search"><Search size={16} aria-hidden="true" /><span className="sr-only">Search access settings</span><input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Find a page…" /></label><span role="status">{saving ? "Saving changes…" : changes.length ? `${changes.length} unsaved ${changes.length === 1 ? "change" : "changes"}` : saved ? "All changes saved" : "Up to date"}</span><div><button className="ui-button ui-button--ghost" disabled={!changes.length || saving} onClick={() => { setEdits({}); setError(""); setSaved(false); }}>Reset changes</button><button className="ui-button" disabled={!changes.length || saving} onClick={save}>{saved ? <Check size={16} aria-hidden="true" /> : <Save size={16} aria-hidden="true" />}{saving ? "Saving…" : "Save changes"}</button></div></div>
    {error && <div className="ui-notice ui-notice--error" role="alert"><CircleAlert size={18} aria-hidden="true" />{error}</div>}
    <div className="btb-access__list">{cards.map((card) => {
      const eligible = btbCanView(card.feature, selectedRole);
      const allowed = btbPageAllowed(card, selectedRole, effective);
      const editable = btbCanEdit(card.feature, selectedRole);
      const slug = pageSlug(card);
      const key = `${selectedRole}:${slug}`;
      return <div className="btb-access__row" key={slug} data-eligible={eligible}>
        <span className="ui-icon ui-tone--purple"><BtbIcon name={card.iconKey} size={18} /></span>
        <div className="btb-access__name"><strong>{card.title}</strong><p>{card.desc}</p></div>
        <span className="ui-badge">{!eligible ? <><LockKeyhole size={12} aria-hidden="true" />Role restricted</> : editable ? "Can update" : <><Eye size={12} aria-hidden="true" />Read-only</>}</span>
        <label className="btb-access__toggle"><input type="checkbox" disabled={!eligible || saving} checked={allowed} aria-label={`${card.title} available to ${BTB_ROLE_LABELS[selectedRole]}`} onChange={(event) => {
          const allowed = event.target.checked;
          setSaved(false);
          setEdits((current) => {
            const next = { ...current };
            if (allowed === btbPageAllowed(card, selectedRole, rows)) delete next[key];
            else next[key] = { role: selectedRole, page: slug, allowed };
            return next;
          });
        }} /><span>{eligible ? allowed ? "Available" : "Hidden" : "Restricted"}</span></label>
      </div>;
    })}{!cards.length && <div className="ui-empty"><h3>No matching pages</h3><p>Try a different page name.</p></div>}</div>
    <p className="dash__provenance">A role’s default access applies until a restriction is saved. Page availability controls the overview and direct-page interface; each feature’s edit rights are determined by the role matrix.</p>
  </div>;
}
