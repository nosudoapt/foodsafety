"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowUpRight, Building2, Plus, Search } from "lucide-react";
import Modal from "@/components/Modal";
import { Badge, Button, Card, PageHeader } from "@/components/ui";
import { LoadState } from "@/components/btb/Feedback";
import { useBtbData } from "@/components/btb/useBtbData";
import type { BtbAdminLocations } from "@/lib/btb-admin";
import LocationForm from "./LocationForm";

export default function BtbAdminLocationsPage() {
  const router = useRouter();
  const { data, loading, error, reload } = useBtbData<BtbAdminLocations>("/api/btb/admin/locations");
  const [query, setQuery] = useState("");
  const [adding, setAdding] = useState(false);
  const [saving, setSaving] = useState(false);
  const visible = data?.locations.filter(site => `${site.name} ${site.address ?? ""}`.toLowerCase().includes(query.trim().toLowerCase())) ?? [];
  return <div className="btb-console__stack">
    <PageHeader title="Locations & people" subtitle="Real locations, named accounts and deliberate access. The demo stays separate." action={<Button accent="red" disabled={loading || !!error} onClick={() => setAdding(true)}><Plus size={18} aria-hidden="true" />Add location</Button>} />
    <div className="btb-console__toolbar"><label className="btb-console__search"><Search size={18} aria-hidden="true" /><span className="sr-only">Search locations</span><input type="search" value={query} onChange={event => setQuery(event.target.value)} placeholder="Search name or address" /></label>{data && <p className="btb-console__hint">{data.locations.filter(site => site.active).length} active · {data.locations.length} managed locations</p>}<Button accent="red" variant="ghost" disabled={loading} onClick={reload}>Refresh</Button></div>
    <LoadState loading={loading} error={error} onRetry={reload} />
    {data && !error && <div className="btb-console__location-grid">{visible.map(site => <Card key={site.id} className="btb-console__location-card"><div className="btb-console__sectionhead"><span className="ui-icon ui-tone--red"><Building2 size={21} aria-hidden="true" /></span><Badge accent={site.active ? "green" : "slate"}>{site.active ? "Active" : "Closed"}</Badge></div><h2>{site.name}</h2><p>{site.address || "Address not added"}</p><p className="btb-console__hint">Workspace: <strong>/btb/{site.slug}</strong></p><dl><div><dt>People</dt><dd>{site.people}</dd></div><div><dt>Enabled pages</dt><dd>{site.pages.length}</dd></div><div><dt>Timezone</dt><dd>{site.timezone || "Needs setup"}</dd></div></dl><Link className="btb-console__text-link" href={`/btb/admin/locations/${site.id}`}>Manage {site.name}<ArrowUpRight size={16} aria-hidden="true" /></Link></Card>)}</div>}
    {data && !error && !visible.length && <Card><div className="ui-empty"><Building2 size={28} aria-hidden="true" /><h2>{query ? "No matching locations" : "Start with a real location"}</h2><p>{query ? "Try a different name or address." : "Create the location, choose its pages, then invite each person using their own email."}</p>{!query && <Button accent="red" onClick={() => setAdding(true)}>Add the first location</Button>}</div></Card>}
    {adding && <Modal open title="Add location" description="Create a managed BTB site without changing FoodSafe locations." busy={saving} onClose={() => setAdding(false)}><LocationForm onBusyChange={setSaving} onCancel={() => setAdding(false)} onSaved={id => { setAdding(false); router.push(`/btb/admin/locations/${id}`); }} /></Modal>}
  </div>;
}
