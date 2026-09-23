"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Bell, CheckCircle2, AlertTriangle, XCircle, X } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { getSessionUser } from "@/lib/admin-store";

interface DocEntry {
  id: string;
  categoryId: string;
  title: string;
  expiryDate: string;
}

interface CategoryMeta {
  label: string;
  warningMonths: number;
}

const categoryMeta: Record<string, CategoryMeta> = {
  health_license: { label: "Health Safety License", warningMonths: 2 },
  business_license: { label: "Business License", warningMonths: 2 },
  business_insurance: { label: "Business Insurance", warningMonths: 2 },
  hoods_sticker: { label: "Hoods Inspection Sticker", warningMonths: 2 },
  fire_suppression: { label: "Fire Suppression System", warningMonths: 2 },
  staff_certs: { label: "Staff Certificate", warningMonths: 2 },
  franchise: { label: "Franchise Agreement", warningMonths: 3 },
  lease: { label: "Lease Agreement", warningMonths: 6 },
  pest_control: { label: "Pest Control", warningMonths: 2 },
  business_license_other: { label: "License", warningMonths: 2 },
};

type Severity = "expired" | "critical" | "warning";

interface AlertItem {
  id: string;
  title: string;
  label: string;
  days: number;
  severity: Severity;
}

function daysUntil(dateStr: string): number {
  const target = new Date(dateStr);
  target.setHours(0, 0, 0, 0);
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  return Math.ceil((target.getTime() - now.getTime()) / 86_400_000);
}

function buildAlerts(docs: Pick<DocEntry, "id" | "categoryId" | "title" | "expiryDate">[]): AlertItem[] {
  const alerts: AlertItem[] = [];
  for (const doc of docs) {
    const meta = categoryMeta[doc.categoryId];
    if (!meta || !doc.expiryDate) continue;
    const days = daysUntil(doc.expiryDate);
    const warnAt = Math.round(meta.warningMonths * 30.44);
    if (days < 0) {
      alerts.push({
        id: doc.id,
        title: doc.title,
        label: meta.label,
        days,
        severity: "expired",
      });
    } else if (days <= warnAt) {
      alerts.push({
        id: doc.id,
        title: doc.title,
        label: meta.label,
        days,
        severity: days <= 14 ? "critical" : "warning",
      });
    }
  }
  return alerts.sort((a, b) => a.days - b.days);
}

function loadLocalAlerts(): AlertItem[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem("btb-documents");
    if (!raw) return [];
    const docs: DocEntry[] = JSON.parse(raw);
    return buildAlerts(docs);
  } catch {
    return [];
  }
}

async function fetchCloudAlerts(): Promise<AlertItem[] | null> {
  const user = await getSessionUser();
  if (!user) return null;
  const { data, error } = await supabase
    .from("documents")
    .select("id, category_id, doc_category, title, expiry_date")
    .eq("user_id", user.id);
  if (error || !data) return null;
  return buildAlerts(
    data.map((row) => ({
      id: String(row.id),
      categoryId: String(row.category_id || row.doc_category || ""),
      title: String(row.title || ""),
      expiryDate: String(row.expiry_date || ""),
    }))
  );
}

function severityStyles(severity: Severity) {
  if (severity === "expired") {
    return { row: "bg-red-50/80", icon: <XCircle className="h-4 w-4 text-red-500 shrink-0" />, text: "text-red-700" };
  }
  if (severity === "critical") {
    return { row: "bg-amber-50/80", icon: <AlertTriangle className="h-4 w-4 text-amber-500 shrink-0" />, text: "text-amber-800" };
  }
  return { row: "bg-white", icon: <Bell className="h-4 w-4 text-gray-400 shrink-0" />, text: "text-gray-700" };
}

export function computeExpiryAlerts(): AlertItem[] {
  return loadLocalAlerts();
}

export default function ExpiryNotifications({ trigger }: { trigger?: ReactNode }) {
  const [open, setOpen] = useState(false);
  const [alerts, setAlerts] = useState<AlertItem[]>([]);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const raf = requestAnimationFrame(() => {
      void (async () => {
        if (cancelled) return;
        setMounted(true);
        const cloud = await fetchCloudAlerts();
        if (cancelled) return;
        if (cloud) {
          setAlerts(cloud);
        } else {
          setAlerts(loadLocalAlerts());
        }
      })();
    });

    const onStorage = (e: StorageEvent) => {
      if (e.key === "btb-documents") setAlerts(loadLocalAlerts());
    };
    window.addEventListener("storage", onStorage);
    const interval = window.setInterval(() => {
      void fetchCloudAlerts().then((cloud) => {
        if (!cancelled) setAlerts(cloud ?? loadLocalAlerts());
      });
    }, 60_000);
    return () => {
      cancelled = true;
      cancelAnimationFrame(raf);
      window.removeEventListener("storage", onStorage);
      window.clearInterval(interval);
    };
  }, []);

  const count = mounted ? alerts.length : 0;
  const label = useMemo(() => `${count} document alert${count === 1 ? "" : "s"}`, [count]);

  return (
    <div className="relative">
      <button
        type="button"
        aria-label={label}
        onClick={() => setOpen((v) => !v)}
        className="relative inline-flex h-10 w-10 items-center justify-center rounded-lg text-gray-500 hover:bg-gray-100 hover:text-gray-800 transition-colors cursor-pointer"
      >
        {trigger ?? <Bell className="h-5 w-5" strokeWidth={1.75} />}
        {count > 0 && (
          <span className="absolute top-1.5 right-1.5 min-w-[16px] h-4 px-1 rounded-full bg-red-600 text-white text-[10px] font-bold flex items-center justify-center">
            {count > 9 ? "9+" : count}
          </span>
        )}
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} aria-hidden="true" />
          <div className="absolute right-0 top-12 z-50 w-[min(360px,calc(100vw-2rem))] rounded-xl border border-gray-200 bg-white shadow-xl shadow-black/5 overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 bg-gray-50/80">
              <div>
                <p className="text-sm font-semibold text-gray-900">Expiry alerts</p>
                <p className="text-[11px] text-gray-500">Licenses, insurance & agreements</p>
              </div>
              <button
                type="button"
                aria-label="Close notifications"
                onClick={() => setOpen(false)}
                className="h-8 w-8 inline-flex items-center justify-center rounded-md text-gray-400 hover:text-gray-700 hover:bg-gray-100 cursor-pointer transition-colors"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="max-h-[320px] overflow-y-auto">
              {alerts.length === 0 ? (
                <div className="px-4 py-8 text-center">
                  <CheckCircle2 className="mx-auto h-8 w-8 text-emerald-500 mb-2" strokeWidth={1.5} />
                  <p className="text-sm font-medium text-gray-900">All clear</p>
                  <p className="text-xs text-gray-500 mt-0.5">
                    No documents expiring within their warning window.
                  </p>
                </div>
              ) : (
                <ul className="divide-y divide-gray-100">
                  {alerts.map((alert) => {
                    const styles = severityStyles(alert.severity);
                    return (
                      <li key={alert.id} className={`px-4 py-3 ${styles.row}`}>
                        <div className="flex items-start gap-2.5">
                          {styles.icon}
                          <div className="min-w-0">
                            <p className="text-[13px] font-medium text-gray-900 truncate">
                              {alert.title}
                            </p>
                            <p className="text-[11px] text-gray-500">{alert.label}</p>
                            <p className={`text-[11px] font-semibold mt-0.5 ${styles.text}`}>
                              {alert.days < 0
                                ? `Expired ${Math.abs(alert.days)} day${Math.abs(alert.days) === 1 ? "" : "s"} ago`
                                : alert.days === 0
                                ? "Expires today"
                                : `Expires in ${alert.days} day${alert.days === 1 ? "" : "s"}`}
                            </p>
                          </div>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>

            <div className="px-4 py-2.5 border-t border-gray-100 bg-gray-50/60">
              <p className="text-[10px] text-gray-400 leading-relaxed">
                Warning windows: licenses & insurance 2 mo · franchise 3 mo · lease 6 mo.
              </p>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
