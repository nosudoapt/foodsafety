"use client";

import { RefreshCw } from "lucide-react";
import { Button } from "@/components/ui";
import { LoadState } from "@/components/btb/Feedback";
import { CHECK_KINDS, type PlatformCheckKind } from "@/lib/btb-platform";
import ChecklistCard, { type PlatformCheck, type PlatformTask } from "@/components/btb/ChecklistCard";
import ReadingsPanel, { type PlatformEquipment, type PlatformSanitizer, type PlatformTemperature } from "./ReadingsPanel";

export interface OperationsData {
  location_id: string;
  location: string;
  business_date: string;
  timezone: string | null;
  checklists: PlatformCheck[];
  templates: { kind: PlatformCheckKind; tasks: PlatformTask[]; version: number }[];
  equipment: PlatformEquipment[];
  temperatures: PlatformTemperature[];
  sanitizer: PlatformSanitizer[];
  sanitizer_slots: string[];
  sanitizer_settings: { chemical: string; min_ppm: number | null; max_ppm: number | null } | null;
  team: { id: string; name: string; role: string }[];
}

export default function OperationsPanel({ readOnly, date, locationId, data, loading, error, reload }: {
  readOnly: boolean;
  date: string;
  locationId: string;
  data: OperationsData | null;
  loading: boolean;
  error: string;
  reload: () => void;
}) {
  return <>
    <LoadState loading={loading} error={error} onRetry={reload} />
    {data && <section className="ops-panel" aria-label="Daily operations">
      <div className="ops-toolbar">
        <div>
          <h2 className="ops-section-title">Opening, closing &amp; cleaning</h2>
          <p className="ops-meta">{date} · every ticked duty records the employee who saved it, with revision history.</p>
        </div>
        <Button variant="ghost" onClick={reload}><RefreshCw size={16} aria-hidden="true" />Refresh record</Button>
      </div>
      <div className="ops-checklist-grid">
        {CHECK_KINDS.map((kind) => <ChecklistCard
          key={`${kind}:${data.checklists.find((item) => item.check_type === kind)?.version ?? 0}`}
          kind={kind}
          date={date}
          check={data.checklists.find((item) => item.check_type === kind)}
          template={data.templates.find((item) => item.kind === kind)?.tasks ?? []}
          locationId={locationId}
          readOnly={readOnly}
          onSaved={() => reload()}
        />)}
      </div>
    </section>}
    {data && <ReadingsPanel readOnly={readOnly} date={date} locationId={locationId} data={data} reload={reload} />}
  </>;
}
