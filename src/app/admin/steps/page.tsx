"use client";

import { useEffect, useState } from "react";
import {
  Zap,
  Wifi,
  CreditCard,
  Phone,
  Pencil,
  RotateCcw,
  Save,
  AlertOctagon,
} from "lucide-react";
import { PageHeader, Card, Button, Badge, inputClass } from "@/components/ui";
import { supabase } from "@/lib/supabase";
import {
  getSessionUser,
  getProfileContext,
  writeLocal,
} from "@/lib/admin-store";

interface Protocol {
  id: string;
  title: string;
  subtitle: string;
  icon: "power" | "internet" | "debit" | "phone";
  steps: string[];
}

const defaultProtocols: Protocol[] = [
  {
    id: "power",
    title: "Power is out",
    subtitle: "Keep food safe and guests informed",
    icon: "power",
    steps: [
      "Do not open walk-in coolers or freezers — cold holds longest when sealed.",
      "Check whether the outage is building-wide or just your unit; note the time it started.",
      "Switch to emergency lighting; post “Cash only — machines temporarily down” at the till.",
      "Record temperatures of all fridges/freezers immediately on the temp sheet.",
      "If power is out >2 hours, begin the temperature log every 30 minutes and call the manager.",
      "Discard any TCS food above 4°C for more than 4 hours — document with photos.",
      "When power returns: reset breakers, wait 15 minutes, then re-check all temps before serving.",
      "Notify corporate/owner with a brief status update once service is restored.",
    ],
  },
  {
    id: "internet",
    title: "Internet is out",
    subtitle: "Keep orders flowing without online systems",
    icon: "internet",
    steps: [
      "Confirm the router/modem lights; try a power cycle (unplug 10 seconds, plug back in).",
      "Switch POS to offline/card-terminal mode if available; switch to cash if terminal fails.",
      "Accept phone and walk-in orders only — pause Uber/DoorDash tablet auto-accept.",
      "Write orders on the paper pad with time, items, and amount paid.",
      "Re-enter paper orders into the POS within 1 hour of connectivity returning.",
      "Notify the ISP from the Login Vault contact list; log the ticket number.",
      "Post a brief note at the till and entrance if delivery apps are affected.",
    ],
  },
  {
    id: "debit",
    title: "Debit machine is not working",
    subtitle: "Never turn a paying guest away",
    icon: "debit",
    steps: [
      "Restart the terminal; check paper roll, power, and connectivity light.",
      "Try a second terminal or the mobile reader if one is on site.",
      "If still down: switch to cash only and post the sign at the till and door.",
      "Offer “pay at pickup” phone orders with card number taken manually only if policy allows — otherwise skip.",
      "For large bills, verify authenticity before accepting.",
      "Log the outage time and terminal ID; call the merchant support number from the Login Vault.",
      "Reconcile any handwritten tickets into the POS at end of shift.",
    ],
  },
  {
    id: "phone",
    title: "Phone is not working",
    subtitle: "Don’t miss catering and pickup orders",
    icon: "phone",
    steps: [
      "Test an incoming call; check line lights and handset cord.",
      "Power-cycle the phone system once; try a mobile phone on the store line if forwarded.",
      "Update the Google/Uber/DoorDash listing note: “Phone lines down — order online or in person.”",
      "Place a staff member near the front for walk-in orders during peak hours.",
      "Log missed calls if voicemail is unavailable; return them as soon as service restores.",
      "Call the telecom provider using the Login Vault entry and open a ticket.",
      "Brief the next shift on status before handover.",
    ],
  },
];

const iconMap = {
  power: Zap,
  internet: Wifi,
  debit: CreditCard,
  phone: Phone,
};

const STORAGE_KEY = "btb-outage-protocols";

const scenarioForId: Record<string, string> = {
  power: "power_out",
  internet: "internet_out",
  debit: "debit_machine_out",
  phone: "phone_out",
};

function rowToProtocol(row: Record<string, unknown>): Protocol | null {
  const scenario = String(row.scenario || "");
  const id =
    scenario === "power_out" ? "power" :
    scenario === "internet_out" ? "internet" :
    scenario === "debit_machine_out" ? "debit" :
    scenario === "phone_out" ? "phone" :
    null;
  if (!id) return null;
  const base = defaultProtocols.find((p) => p.id === id);
  if (!base) return null;
  return {
    ...base,
    title: String(row.title || base.title),
    subtitle: String(row.subtitle || base.subtitle),
    icon: (row.icon as Protocol["icon"]) || base.icon,
    steps: Array.isArray(row.steps) ? (row.steps as string[]) : base.steps,
  };
}

export default function OutageStepsPage() {
  const [protocols, setProtocols] = useState<Protocol[]>(defaultProtocols);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<string>("");
  const [dirty, setDirty] = useState(false);
  const [savedFlash, setSavedFlash] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const raf = requestAnimationFrame(() => {
      void (async () => {
        const user = await getSessionUser();
        if (cancelled) return;
        if (user) {
          const { data, error } = await supabase
            .from("steps_to_do")
            .select("*")
            .or(`user_id.eq.${user.id},user_id.is.null`);
          if (!cancelled && !error && data && data.length > 0) {
            const mapped = data
              .map(rowToProtocol)
              .filter((p): p is Protocol => p != null);
            if (mapped.length > 0) {
              const byId = new Map(mapped.map((p) => [p.id, p]));
              const merged = defaultProtocols.map((d) => byId.get(d.id) || d);
              setProtocols(merged);
              writeLocal(STORAGE_KEY, merged);
            }
            return;
          }
        }
        if (!cancelled) {
          try {
            const raw = localStorage.getItem(STORAGE_KEY);
            if (raw) {
              const parsed = JSON.parse(raw) as Protocol[];
              if (Array.isArray(parsed) && parsed.length === defaultProtocols.length) {
                setProtocols(parsed);
              }
            }
          } catch {
            /* use defaults */
          }
        }
      })();
    });
    return () => {
      cancelled = true;
      cancelAnimationFrame(raf);
    };
  }, []);

  const startEdit = (p: Protocol) => {
    setEditingId(p.id);
    setDraft(p.steps.join("\n"));
  };

  const saveEdit = () => {
    const steps = draft
      .split("\n")
      .map((s) => s.trim())
      .filter(Boolean);
    setProtocols((prev) => prev.map((p) => (p.id === editingId ? { ...p, steps } : p)));
    setEditingId(null);
    setDirty(true);
  };

  const resetDefaults = () => {
    if (!confirm("Restore all protocols to factory defaults?")) return;
    setProtocols(defaultProtocols);
    writeLocal(STORAGE_KEY, defaultProtocols);
    void persistRemote(defaultProtocols);
    setDirty(false);
    setEditingId(null);
  };

  const persistRemote = async (list: Protocol[]) => {
    const user = await getSessionUser();
    if (!user) return;
    const ctx = await getProfileContext();
    for (const p of list) {
      const scenario = scenarioForId[p.id];
      if (!scenario) continue;
      const { data: existing } = await supabase
        .from("steps_to_do")
        .select("id")
        .eq("user_id", user.id)
        .eq("scenario", scenario)
        .maybeSingle();
      const payload = {
        user_id: user.id,
        restaurant_name: ctx.restaurantName,
        scenario,
        title: p.title,
        subtitle: p.subtitle,
        icon: p.icon,
        steps: p.steps,
        last_updated: new Date().toISOString(),
        updated_by: user.id,
      };
      if (existing?.id) {
        await supabase.from("steps_to_do").update(payload).eq("id", existing.id);
      } else {
        await supabase.from("steps_to_do").insert(payload);
      }
    }
  };

  const persist = () => {
    writeLocal(STORAGE_KEY, protocols);
    void persistRemote(protocols);
    setDirty(false);
    setSavedFlash(true);
    setTimeout(() => setSavedFlash(false), 2000);
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Steps to do"
        description="What to do when the power, internet, debit machine, or phone goes down. Edit steps to match your location, then save."
        actions={
          <>
            <Button variant="secondary" onClick={resetDefaults}>
              <RotateCcw className="h-4 w-4" /> Reset
            </Button>
            <Button onClick={persist} disabled={!dirty}>
              {savedFlash ? (
                <>
                  <Save className="h-4 w-4" /> Saved
                </>
              ) : (
                <>
                  <Save className="h-4 w-4" /> Save changes
                </>
              )}
            </Button>
          </>
        }
      />

      {dirty && (
        <div className="flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3.5 py-2.5 text-[13px] text-amber-800">
          <AlertOctagon className="h-4 w-4 shrink-0" />
          Unsaved changes — hit <strong className="font-semibold">Save changes</strong> to keep edits.
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        {protocols.map((protocol) => {
          const Icon = iconMap[protocol.icon];
          const isEditing = editingId === protocol.id;
          return (
            <Card key={protocol.id} className="flex flex-col" padded={false}>
              <div className="flex items-start justify-between gap-3 border-b border-gray-100 px-5 py-4">
                <div className="flex items-start gap-3 min-w-0">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-red-50 text-red-600">
                    <Icon className="h-5 w-5" strokeWidth={1.75} />
                  </div>
                  <div className="min-w-0">
                    <h2 className="text-[15px] font-semibold text-gray-900">{protocol.title}</h2>
                    <p className="text-xs text-gray-500 mt-0.5">{protocol.subtitle}</p>
                  </div>
                </div>
                {!isEditing && (
                  <Button variant="ghost" onClick={() => startEdit(protocol)} className="shrink-0">
                    <Pencil className="h-3.5 w-3.5" /> Edit
                  </Button>
                )}
              </div>

              <div className="flex-1 px-5 py-4">
                {isEditing ? (
                  <div className="space-y-3">
                    <textarea
                      value={draft}
                      onChange={(e) => setDraft(e.target.value)}
                      rows={10}
                      className={`${inputClass} font-mono text-[12px] leading-relaxed resize-y`}
                      aria-label={`Edit steps for ${protocol.title}`}
                    />
                    <div className="flex gap-2">
                      <Button onClick={saveEdit}>
                        <Save className="h-4 w-4" /> Apply
                      </Button>
                      <Button variant="secondary" onClick={() => setEditingId(null)}>
                        Cancel
                      </Button>
                    </div>
                  </div>
                ) : (
                  <ol className="space-y-2.5">
                    {protocol.steps.map((step, i) => (
                      <li key={i} className="flex gap-3 text-[13px] leading-relaxed text-gray-700">
                        <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-gray-100 text-[10px] font-bold text-gray-500">
                          {i + 1}
                        </span>
                        <span>{step}</span>
                      </li>
                    ))}
                  </ol>
                )}
              </div>

              <div className="border-t border-gray-100 px-5 py-3">
                <Badge tone="gray">{protocol.steps.length} steps</Badge>
              </div>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
