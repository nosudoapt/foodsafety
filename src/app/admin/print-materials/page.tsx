"use client";

import { useState } from "react";
import { Printer, FileText, TriangleAlert, GraduationCap } from "lucide-react";
import { PageHeader, Card, Button, Badge } from "@/components/ui";
import type { ReactNode } from "react";

type TemplateId = "application" | "incident" | "warning";

const templates: {
  id: TemplateId;
  name: string;
  description: string;
  icon: ReactNode;
}[] = [
  {
    id: "application",
    name: "Job application form",
    description: "Standard employment application — print blank or fill digitally before printing.",
    icon: <GraduationCap className="h-5 w-5" strokeWidth={1.75} />,
  },
  {
    id: "incident",
    name: "Incident report",
    description: "Document workplace incidents, injuries, and property damage.",
    icon: <TriangleAlert className="h-5 w-5" strokeWidth={1.75} />,
  },
  {
    id: "warning",
    name: "Warning letter",
    description: "Formal written warning for policy or performance issues.",
    icon: <FileText className="h-5 w-5" strokeWidth={1.75} />,
  },
];

function ApplicationForm({ data, onChange }: { data: Record<string, string>; onChange: (k: string, v: string) => void }) {
  const row = "grid grid-cols-1 sm:grid-cols-2 gap-3";
  const inp =
    "w-full border-0 border-b border-gray-300 bg-transparent px-0 py-1.5 text-[13px] text-gray-900 focus:outline-none focus:border-red-500";
  const lbl = "block text-[10px] font-bold uppercase tracking-wider text-gray-400";

  return (
    <div className="space-y-5 text-gray-800">
      <div className="text-center border-b border-gray-200 pb-3">
        <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-red-600">Between the Buns</p>
        <h3 className="text-lg font-semibold mt-1">Job Application</h3>
      </div>
      <div className={row}>
        <div>
          <label className={lbl}>Full name</label>
          <input className={inp} value={data.name || ""} onChange={(e) => onChange("name", e.target.value)} />
        </div>
        <div>
          <label className={lbl}>Date</label>
          <input className={inp} value={data.date || ""} onChange={(e) => onChange("date", e.target.value)} placeholder="YYYY-MM-DD" />
        </div>
      </div>
      <div className={row}>
        <div>
          <label className={lbl}>Phone</label>
          <input className={inp} value={data.phone || ""} onChange={(e) => onChange("phone", e.target.value)} />
        </div>
        <div>
          <label className={lbl}>Email</label>
          <input className={inp} value={data.email || ""} onChange={(e) => onChange("email", e.target.value)} />
        </div>
      </div>
      <div>
        <label className={lbl}>Address</label>
        <input className={inp} value={data.address || ""} onChange={(e) => onChange("address", e.target.value)} />
      </div>
      <div className={row}>
        <div>
          <label className={lbl}>Position applying for</label>
          <input className={inp} value={data.position || ""} onChange={(e) => onChange("position", e.target.value)} />
        </div>
        <div>
          <label className={lbl}>Available start date</label>
          <input className={inp} value={data.start || ""} onChange={(e) => onChange("start", e.target.value)} />
        </div>
      </div>
      <div className={row}>
        <div>
          <label className={lbl}>Hours per week</label>
          <input className={inp} value={data.hours || ""} onChange={(e) => onChange("hours", e.target.value)} />
        </div>
        <div>
          <label className={lbl}>Emergency contact</label>
          <input className={inp} value={data.emergency || ""} onChange={(e) => onChange("emergency", e.target.value)} />
        </div>
      </div>
      <div>
        <label className={lbl}>Relevant experience</label>
        <textarea
          className={`${inp} min-h-[72px] resize-y`}
          value={data.experience || ""}
          onChange={(e) => onChange("experience", e.target.value)}
        />
      </div>
      <div className="grid grid-cols-2 gap-4 pt-2">
        <div>
          <label className={lbl}>Applicant signature</label>
          <div className="mt-6 border-b border-gray-400" />
        </div>
        <div>
          <label className={lbl}>Date</label>
          <div className="mt-6 border-b border-gray-400" />
        </div>
      </div>
    </div>
  );
}

function IncidentForm({ data, onChange }: { data: Record<string, string>; onChange: (k: string, v: string) => void }) {
  const inp =
    "w-full border-0 border-b border-gray-300 bg-transparent px-0 py-1.5 text-[13px] text-gray-900 focus:outline-none focus:border-red-500";
  const lbl = "block text-[10px] font-bold uppercase tracking-wider text-gray-400";

  return (
    <div className="space-y-5 text-gray-800">
      <div className="text-center border-b border-gray-200 pb-3">
        <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-red-600">Between the Buns</p>
        <h3 className="text-lg font-semibold mt-1">Incident Report</h3>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div>
          <label className={lbl}>Date</label>
          <input className={inp} value={data.date || ""} onChange={(e) => onChange("date", e.target.value)} />
        </div>
        <div>
          <label className={lbl}>Time</label>
          <input className={inp} value={data.time || ""} onChange={(e) => onChange("time", e.target.value)} />
        </div>
        <div>
          <label className={lbl}>Location / area</label>
          <input className={inp} value={data.area || ""} onChange={(e) => onChange("area", e.target.value)} />
        </div>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label className={lbl}>Reported by</label>
          <input className={inp} value={data.reporter || ""} onChange={(e) => onChange("reporter", e.target.value)} />
        </div>
        <div>
          <label className={lbl}>Person involved</label>
          <input className={inp} value={data.involved || ""} onChange={(e) => onChange("involved", e.target.value)} />
        </div>
      </div>
      <div>
        <label className={lbl}>Type of incident</label>
        <input className={inp} value={data.type || ""} onChange={(e) => onChange("type", e.target.value)} placeholder="Injury / spill / equipment / customer / other" />
      </div>
      <div>
        <label className={lbl}>Description of what happened</label>
        <textarea
          className={`${inp} min-h-[96px] resize-y`}
          value={data.description || ""}
          onChange={(e) => onChange("description", e.target.value)}
        />
      </div>
      <div>
        <label className={lbl}>Immediate action taken</label>
        <textarea
          className={`${inp} min-h-[64px] resize-y`}
          value={data.action || ""}
          onChange={(e) => onChange("action", e.target.value)}
        />
      </div>
      <div>
        <label className={lbl}>Witnesses</label>
        <input className={inp} value={data.witnesses || ""} onChange={(e) => onChange("witnesses", e.target.value)} />
      </div>
      <div className="grid grid-cols-2 gap-4 pt-2">
        <div>
          <label className={lbl}>Manager signature</label>
          <div className="mt-6 border-b border-gray-400" />
        </div>
        <div>
          <label className={lbl}>Date reviewed</label>
          <div className="mt-6 border-b border-gray-400" />
        </div>
      </div>
    </div>
  );
}

function WarningForm({ data, onChange }: { data: Record<string, string>; onChange: (k: string, v: string) => void }) {
  const inp =
    "w-full border-0 border-b border-gray-300 bg-transparent px-0 py-1.5 text-[13px] text-gray-900 focus:outline-none focus:border-red-500";
  const lbl = "block text-[10px] font-bold uppercase tracking-wider text-gray-400";

  return (
    <div className="space-y-5 text-gray-800">
      <div className="text-center border-b border-gray-200 pb-3">
        <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-red-600">Between the Buns</p>
        <h3 className="text-lg font-semibold mt-1">Written Warning</h3>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label className={lbl}>Employee name</label>
          <input className={inp} value={data.employee || ""} onChange={(e) => onChange("employee", e.target.value)} />
        </div>
        <div>
          <label className={lbl}>Position</label>
          <input className={inp} value={data.position || ""} onChange={(e) => onChange("position", e.target.value)} />
        </div>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label className={lbl}>Issued by</label>
          <input className={inp} value={data.issuer || ""} onChange={(e) => onChange("issuer", e.target.value)} />
        </div>
        <div>
          <label className={lbl}>Date</label>
          <input className={inp} value={data.date || ""} onChange={(e) => onChange("date", e.target.value)} />
        </div>
      </div>
      <div>
        <label className={lbl}>Reason for warning</label>
        <textarea
          className={`${inp} min-h-[64px] resize-y`}
          value={data.reason || ""}
          onChange={(e) => onChange("reason", e.target.value)}
        />
      </div>
      <div>
        <label className={lbl}>Expected improvement / corrective action</label>
        <textarea
          className={`${inp} min-h-[64px] resize-y`}
          value={data.action || ""}
          onChange={(e) => onChange("action", e.target.value)}
        />
      </div>
      <div>
        <label className={lbl}>Consequence if not corrected</label>
        <input className={inp} value={data.consequence || ""} onChange={(e) => onChange("consequence", e.target.value)} />
      </div>
      <div className="grid grid-cols-2 gap-4 pt-2">
        <div>
          <label className={lbl}>Employee signature</label>
          <div className="mt-6 border-b border-gray-400" />
        </div>
        <div>
          <label className={lbl}>Manager signature</label>
          <div className="mt-6 border-b border-gray-400" />
        </div>
      </div>
      <p className="text-[11px] text-gray-500 italic">
        A copy of this signed warning will be filed in the employee&apos;s personnel record.
      </p>
    </div>
  );
}

export default function PrintMaterialsPage() {
  const [active, setActive] = useState<TemplateId>("application");
  const [formData, setFormData] = useState<Record<string, Record<string, string>>>({
    application: {},
    incident: {},
    warning: {},
  });

  const current = templates.find((t) => t.id === active)!;
  const setField = (k: string, v: string) =>
    setFormData((prev) => ({ ...prev, [active]: { ...prev[active], [k]: v } }));

  const print = () => window.print();

  return (
    <div className="space-y-6">
      <PageHeader
        title="Material to print"
        description="Application form, incident report, warning letter, and more. Fill in the fields, then print."
        actions={
          <Button onClick={print}>
            <Printer className="h-4 w-4" /> Print
          </Button>
        }
      />

      <div className="grid gap-4 lg:grid-cols-3 print:lg:grid-cols-1">
        <div className="space-y-3 print:hidden">
          {templates.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setActive(t.id)}
              className={`w-full text-left rounded-xl border p-4 transition-all cursor-pointer ${
                active === t.id
                  ? "border-red-200 bg-red-50/60 shadow-sm ring-1 ring-red-100"
                  : "border-gray-200 bg-white hover:border-gray-300 hover:shadow-sm"
              }`}
            >
              <div className="flex items-start gap-3">
                <div
                  className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${
                    active === t.id ? "bg-red-600 text-white" : "bg-gray-100 text-gray-500"
                  }`}
                >
                  {t.icon}
                </div>
                <div className="min-w-0">
                  <p className="text-[13px] font-semibold text-gray-900">{t.name}</p>
                  <p className="mt-0.5 text-[12px] text-gray-500 leading-snug">{t.description}</p>
                </div>
              </div>
            </button>
          ))}

          <Card>
            <p className="text-[12px] text-gray-500 leading-relaxed">
              <strong className="text-gray-700">Tip:</strong> fill fields on screen for a completed
              copy, or leave blank and print empty forms for the manager binder.
            </p>
          </Card>
        </div>

        <div className="lg:col-span-2">
          <div className="rounded-xl border border-gray-200 bg-white shadow-[0_1px_2px_rgba(16,24,40,0.04)]">
            <div className="flex items-center justify-between border-b border-gray-100 px-5 py-3 print:hidden">
              <div className="flex items-center gap-2">
                <Badge tone="red">{current.name}</Badge>
                <span className="text-[11px] text-gray-400">Print-ready A4</span>
              </div>
              <Button onClick={print} variant="secondary">
                <Printer className="h-4 w-4" /> Print
              </Button>
            </div>
            <div className="p-6 sm:p-8 print:p-6">
              {active === "application" && (
                <ApplicationForm data={formData.application} onChange={setField} />
              )}
              {active === "incident" && (
                <IncidentForm data={formData.incident} onChange={setField} />
              )}
              {active === "warning" && (
                <WarningForm data={formData.warning} onChange={setField} />
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
