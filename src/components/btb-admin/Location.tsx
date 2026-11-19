"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowLeft, Building2 } from "lucide-react";
import { Badge, Button, Card, PageHeader } from "@/components/ui";
import { LoadState } from "@/components/btb/Feedback";
import { useBtbData } from "@/components/btb/useBtbData";
import type { BtbAdminLocation } from "@/lib/btb-admin";
import LocationForm from "./LocationForm";
import People from "./People";

export default function BtbAdminLocationPage({ id }: { id: string }) {
  const { data, loading, error, reload } = useBtbData<{ location: BtbAdminLocation }>(`/api/btb/admin/locations/${id}`);
  const [notice, setNotice] = useState("");
  return <div className="btb-console__stack"><Link className="btb-console__text-link" href="/btb/admin/locations"><ArrowLeft size={16} aria-hidden="true" />All locations</Link><PageHeader title={data?.location.name ?? "Location"} subtitle="Settings and named access for this managed BTB site." action={<Button accent="red" variant="ghost" disabled={loading} onClick={reload}>Refresh location</Button>} /><LoadState loading={loading} error={error} onRetry={reload} />{data && !error && <><div className="ui-actions"><Badge accent={data.location.active ? "green" : "slate"}>{data.location.active ? "Active location" : "Closed location"}</Badge><Badge accent="slate">{data.location.pages.length} enabled pages</Badge></div>{notice && <p className="ui-notice ui-notice--success" role="status">{notice}</p>}<Card className="btb-console__settings"><div className="btb-console__sectionhead"><div><p className="btb-console__eyebrow">Location settings</p><h2>A place for the everyday.</h2></div><Building2 size={24} aria-hidden="true" /></div><LocationForm key={data.location.version} location={data.location} onSaved={() => { setNotice("Location saved. Memberships and historical records are kept."); reload(); }} /></Card><People key={id} location={data.location} /></>}</div>;
}
