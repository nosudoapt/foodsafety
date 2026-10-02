"use client";

import { useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";
import { Card, PageHeader, Button, Input, Badge } from "@/components/ui";
import { ChevronDown, Phone, Plus, Trash2, AlertTriangle, RefreshCw } from "lucide-react";

// Category directory restored from the reverted admin build: fixed trade and
// service categories, 3 preference slots each (one saved company per slot,
// up to 3 phone numbers per company). Rows autosave to emergency_contacts.
interface Group {
  id: string;
  label: string;
  icon: string;
  custom?: boolean;
}

interface Contact {
  id: string;
  company: string;
  phone1: string;
  phone2: string;
  phone3: string;
  contactName: string;
  email: string;
  notes: string;
}

interface ContactRow {
  id: string;
  category: string | null;
  name: string;
  phone: string;
  phone_2: string | null;
  phone_3: string | null;
  contact_name: string | null;
  email: string | null;
  notes: string | null;
}

const COLS = "id, category, name, phone, phone_2, phone_3, contact_name, email, notes";
const SLOTS = 3;
const LEGACY_KEY = "btb-emergency-contacts";

const TRADE: Group[] = [
  { id: "electrician", label: "Electrician", icon: "⚡" },
  { id: "plumber", label: "Plumber", icon: "🔧" },
  { id: "handyman", label: "Handyman", icon: "🔨" },
  { id: "hvac", label: "HVAC / Cooler & Freezer Repairs", icon: "❄️" },
];

const SERVICES: Group[] = [
  { id: "grease_trap", label: "Grease Trap", icon: "🛢️" },
  { id: "pest_control", label: "Pest Control", icon: "🐛" },
  { id: "canadian_linen", label: "Canadian Linen", icon: "👔" },
  { id: "internet_provider", label: "Internet Provider", icon: "🌐" },
  { id: "security_system", label: "Security System", icon: "🔒" },
  { id: "hoods_repair", label: "Hoods Repair & Cleaning", icon: "🧹" },
  { id: "fire_suppression", label: "Fire Suppression Services", icon: "🔥" },
];

const FIXED_IDS = new Set([...TRADE, ...SERVICES].map((g) => g.id));

function emptySlot(): Contact {
  return { id: crypto.randomUUID(), company: "", phone1: "", phone2: "", phone3: "", contactName: "", email: "", notes: "" };
}

function slotGroup(): Contact[] {
  return [emptySlot(), emptySlot(), emptySlot()];
}

function hasData(c: Contact): boolean {
  return [c.company, c.phone1, c.phone2, c.phone3, c.contactName, c.email, c.notes].some((v) => v.trim());
}

function blankGroups(): Record<string, Contact[]> {
  const g: Record<string, Contact[]> = {};
  for (const id of FIXED_IDS) g[id] = slotGroup();
  return g;
}

function rowsToState(rows: ContactRow[]): { groups: Record<string, Contact[]>; customs: Group[] } {
  const groups: Record<string, Contact[]> = {};
  const customs: Group[] = [];
  for (const row of rows) {
    const cat = row.category || "other";
    (groups[cat] ??= []).push({
      id: row.id,
      company: row.name || "",
      phone1: row.phone || "",
      phone2: row.phone_2 || "",
      phone3: row.phone_3 || "",
      contactName: row.contact_name || "",
      email: row.email || "",
      notes: row.notes || "",
    });
  }
  for (const [cat, list] of Object.entries(groups)) {
    while (list.length < SLOTS) list.push(emptySlot());
    if (!FIXED_IDS.has(cat)) {
      customs.push({ id: cat, label: cat === "other" ? "Other" : cat, icon: "📎", custom: true });
    }
  }
  for (const id of FIXED_IDS) groups[id] ??= slotGroup();
  return { groups, customs };
}

// Older build kept the directory in localStorage only. Salvage it when the
// table is empty (ids are remapped — legacy ids aren't UUIDs).
function readLegacy(): { groups: Record<string, Contact[]>; customs: Group[] } | null {
  try {
    const raw = localStorage.getItem(LEGACY_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as {
      contacts?: Record<string, Array<Partial<Contact>>>;
      customServices?: Array<{ id: string; label: string }>;
    };
    const contacts = parsed.contacts;
    if (!contacts || !Object.keys(contacts).length) return null;
    const labels: Record<string, string> = {};
    for (const s of parsed.customServices ?? []) labels[s.id] = s.label;

    const groups: Record<string, Contact[]> = {};
    const customs: Group[] = [];
    for (const [key, list] of Object.entries(contacts)) {
      const cat = key.startsWith("custom_") ? labels[key] || key : key;
      const slots = (list ?? [])
        .filter((c) => c && [c.company, c.phone1, c.phone2, c.phone3, c.contactName, c.email, c.notes].some((v) => v && String(v).trim()))
        .map((c) => ({
          id: crypto.randomUUID(),
          company: String(c.company ?? ""),
          phone1: String(c.phone1 ?? ""),
          phone2: String(c.phone2 ?? ""),
          phone3: String(c.phone3 ?? ""),
          contactName: String(c.contactName ?? ""),
          email: String(c.email ?? ""),
          notes: String(c.notes ?? ""),
        }));
      if (!slots.length) continue;
      while (slots.length < SLOTS) slots.push(emptySlot());
      groups[cat] = slots;
      if (!FIXED_IDS.has(cat)) customs.push({ id: cat, label: cat, icon: "📎", custom: true });
    }
    if (!Object.keys(groups).length) return null;
    for (const id of FIXED_IDS) groups[id] ??= slotGroup();
    return { groups, customs };
  } catch {
    return null;
  }
}

interface ContactsLoadResult {
  groups: Record<string, Contact[]>;
  customs: Group[];
  savedIds: string[];
  dirty: boolean;
  error: string | null;
}

// Lives outside the component so the effect only calls setState inside the
// promise callback (react-hooks/set-state-in-effect).
async function fetchContacts(): Promise<ContactsLoadResult> {
  try {
    let q = supabase.from("emergency_contacts").select(COLS).order("rank").order("created_at").limit(200);
    if (typeof AbortSignal.timeout === "function") q = q.abortSignal(AbortSignal.timeout(8000));
    const { data, error } = await q;
    if (error) {
      throw new Error(
        error.message + (error.message.includes("category") ? " — run supabase/schema-emergency-contacts.sql in the Supabase SQL editor first." : "")
      );
    }
    const rows = (data ?? []) as ContactRow[];
    if (rows.length) {
      const state = rowsToState(rows);
      return { ...state, savedIds: rows.map((r) => r.id), dirty: false, error: null };
    }
    const legacy = readLegacy();
    if (legacy) {
      // one-time salvage into the empty table via the autosave path
      return { groups: legacy.groups, customs: legacy.customs, savedIds: [], dirty: true, error: null };
    }
    return { groups: blankGroups(), customs: [], savedIds: [], dirty: false, error: null };
  } catch (e) {
    return {
      groups: blankGroups(), customs: [], savedIds: [], dirty: false,
      error: e instanceof Error ? e.message : "Couldn’t load contacts.",
    };
  }
}

export default function EmergencyContacts({ readOnly = false }: { readOnly?: boolean }) {
  const [groups, setGroups] = useState<Record<string, Contact[]>>({});
  const [customs, setCustoms] = useState<Group[]>([]);
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(true);
  const [loaded, setLoaded] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [newLabel, setNewLabel] = useState("");
  const [reloadKey, setReloadKey] = useState(0);
  const savedIds = useRef<Set<string>>(new Set());
  const dirty = useRef(false);

  useEffect(() => {
    let cancelled = false;
    fetchContacts().then((res) => {
      if (cancelled) return;
      setGroups(res.groups);
      setCustoms(res.customs);
      setLoadError(res.error);
      savedIds.current = new Set(res.savedIds);
      dirty.current = res.dirty;
      setLoading(false);
      setLoaded(true);
    });
    return () => { cancelled = true; };
  }, [reloadKey]);

  // Debounced autosave: every edit upserts filled slots and deletes slots that
  // were cleared. Only runs after load, for editors (RLS), once dirty.
  useEffect(() => {
    if (!loaded || readOnly || !dirty.current) return;
    const t = setTimeout(() => {
      void (async () => {
        const rows: Record<string, unknown>[] = [];
        const keep = new Set<string>();
        for (const [category, list] of Object.entries(groups)) {
          list.forEach((c, i) => {
            if (!hasData(c)) return;
            keep.add(c.id);
            rows.push({
              id: c.id,
              category,
              name: c.company.trim() || c.phone1.trim() || "Contact",
              phone: c.phone1.trim(),
              phone_2: c.phone2.trim() || null,
              phone_3: c.phone3.trim() || null,
              contact_name: c.contactName.trim() || null,
              email: c.email.trim() || null,
              notes: c.notes.trim() || null,
              kind: "service",
              rank: i + 1,
            });
          });
        }
        const stale = [...savedIds.current].filter((id) => !keep.has(id));
        if (stale.length) {
          const { error } = await supabase.from("emergency_contacts").delete().in("id", stale);
          if (error) {
            setSaveError(`Couldn’t remove cleared entries: ${error.message}`);
            return;
          }
          for (const id of stale) savedIds.current.delete(id);
        }
        if (rows.length) {
          const { error } = await supabase.from("emergency_contacts").upsert(rows, { onConflict: "id" });
          if (error) {
            setSaveError(`Couldn’t save contacts: ${error.message}`);
            return;
          }
          for (const r of rows) savedIds.current.add(String(r.id));
        }
        setSaveError(null);
      })();
    }, 600);
    return () => clearTimeout(t);
  }, [groups, loaded, readOnly]);

  function update(cat: string, index: number, key: keyof Contact, value: string) {
    dirty.current = true;
    setGroups((prev) => {
      const list = [...(prev[cat] ?? [])];
      while (list.length <= index) list.push(emptySlot());
      list[index] = { ...list[index], [key]: value };
      return { ...prev, [cat]: list };
    });
  }

  function addCustom() {
    const label = newLabel.trim();
    if (!label) return;
    if (FIXED_IDS.has(label) || customs.some((g) => g.id === label)) {
      setOpen((prev) => ({ ...prev, [label]: true }));
      setNewLabel("");
      setShowAdd(false);
      return;
    }
    dirty.current = true;
    setCustoms((prev) => [...prev, { id: label, label, icon: "📎", custom: true }]);
    setGroups((prev) => ({ ...prev, [label]: prev[label] ?? slotGroup() }));
    setOpen((prev) => ({ ...prev, [label]: true }));
    setNewLabel("");
    setShowAdd(false);
  }

  function removeCustom(g: Group) {
    if (!confirm(`Remove “${g.label}” and its saved entries?`)) return;
    const ids = (groups[g.id] ?? []).map((c) => c.id).filter((id) => savedIds.current.has(id));
    setCustoms((prev) => prev.filter((x) => x.id !== g.id));
    setGroups((prev) => {
      const next = { ...prev };
      delete next[g.id];
      return next;
    });
    setOpen((prev) => {
      const next = { ...prev };
      delete next[g.id];
      return next;
    });
    if (ids.length) {
      void supabase.from("emergency_contacts").delete().in("id", ids).then(({ error }) => {
        if (error) setSaveError(`Couldn’t remove “${g.label}”: ${error.message}`);
        else for (const id of ids) savedIds.current.delete(id);
      });
    }
  }

  const serviceGroups = [...SERVICES, ...customs.filter((c) => !FIXED_IDS.has(c.id))];
  const filledCount = Object.values(groups).reduce((n, list) => n + list.filter(hasData).length, 0);

  function renderSlot(cat: string, c: Contact | undefined, i: number) {
    if (!c) return null;
    if (readOnly) {
      if (!hasData(c)) return null;
      const phones = [c.phone1, c.phone2, c.phone3].filter((p) => p.trim());
      return (
        <div key={c.id} className="rounded-xl border border-slate-200 bg-slate-50 p-3">
          <p className="font-semibold text-slate-900 text-sm">{c.company || "Contact"}</p>
          {c.contactName && <p className="text-xs text-slate-500">{c.contactName}</p>}
          <div className="flex flex-wrap gap-2 mt-2">
            {phones.length ? phones.map((p) => (
              <a key={p} href={`tel:${p}`} className="inline-flex items-center gap-1.5 text-sm font-semibold text-green-700 bg-green-100 px-3 py-1.5 rounded-xl hover:brightness-95">
                <Phone className="w-4 h-4" /> {p}
              </a>
            )) : <span className="text-xs text-slate-400">No number saved</span>}
          </div>
          {c.email && <a href={`mailto:${c.email}`} className="block text-xs text-blue-600 mt-1.5 break-all">{c.email}</a>}
          {c.notes && <p className="text-xs text-slate-500 mt-1">{c.notes}</p>}
        </div>
      );
    }
    const field = (label: string, key: keyof Contact, type = "text", placeholder = "") => (
      <div>
        <label className="block text-[10px] font-medium text-slate-500 mb-0.5">{label}</label>
        <input type={type} value={c[key]} disabled={readOnly} placeholder={placeholder}
          onChange={(e) => update(cat, i, key, e.target.value)}
          className="w-full px-2.5 py-1.5 border border-slate-300 rounded-lg text-sm text-slate-900 bg-white outline-none focus:ring-2 focus:ring-red-500 disabled:bg-slate-50" />
      </div>
    );
    return (
      <div key={c.id} className={`rounded-xl border p-3 ${hasData(c) ? "border-slate-200 bg-slate-50" : "border-dashed border-slate-200 bg-white"}`}>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
          {field("Company", "company", "text", "Company name")}
          {field("Phone 1", "phone1", "tel", "(555) 123-4567")}
          {field("Phone 2", "phone2", "tel", "(555) 234-5678")}
          {field("Phone 3", "phone3", "tel", "(555) 345-6789")}
          {field("Contact name", "contactName", "text", "Contact person")}
          {field("Email", "email", "email", "email@example.com")}
        </div>
        <div className="mt-2">{field("Notes", "notes", "text", "Additional notes")}</div>
      </div>
    );
  }

  function renderGroup(g: Group) {
    const list = groups[g.id] ?? [];
    const filled = list.filter(hasData).length;
    const isOpen = !!open[g.id];
    return (
      <Card key={g.id} className={`overflow-hidden ${isOpen ? "md:col-span-2" : ""}`}>
        <div className="flex items-stretch">
          <button type="button" onClick={() => setOpen((prev) => ({ ...prev, [g.id]: !isOpen }))}
            className="flex-1 flex items-center justify-between gap-3 px-4 py-3 text-left hover:bg-slate-50 transition-colors">
            <span className="flex items-center gap-3 min-w-0">
              <span className="text-xl">{g.icon}</span>
              <span className="min-w-0">
                <span className="block font-bold text-slate-900 text-sm truncate">{g.label}</span>
                <span className="block text-[11px] text-slate-500">{filled ? `${filled} of ${SLOTS} saved` : `${SLOTS} preference slots`}</span>
              </span>
            </span>
            <ChevronDown className={`w-5 h-5 flex-shrink-0 text-slate-400 transition-transform ${isOpen ? "rotate-180" : ""}`} />
          </button>
          {g.custom && !readOnly && (
            <div className="flex items-center pr-3">
              <button type="button" onClick={() => removeCustom(g)} className="p-1.5 text-slate-300 hover:text-red-500" title="Remove category">
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          )}
        </div>
        {isOpen && (
          <div className="border-t border-slate-100 px-4 py-3 space-y-3">
            {list.map((c, i) => renderSlot(g.id, c, i))}
          </div>
        )}
      </Card>
    );
  }

  function renderSection(title: string, icon: string, list: Group[]) {
    return (
      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2"><span className="text-xl">{icon}</span> {title}</h2>
          {title === "Service Contacts" && !readOnly && !showAdd && (
            <Button accent="red" variant="soft" onClick={() => setShowAdd(true)} className="px-3 py-1.5 text-xs">
              <Plus className="w-3.5 h-3.5" /> Add Custom
            </Button>
          )}
        </div>
        {title === "Service Contacts" && showAdd && (
          <Card className="p-4 mb-3">
            <div className="flex flex-col sm:flex-row gap-2">
              <div className="flex-1">
                <Input accent="red" autoFocus value={newLabel} placeholder="e.g. Landscaping"
                  onChange={(e) => setNewLabel(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") addCustom(); if (e.key === "Escape") setShowAdd(false); }} />
              </div>
              <div className="flex gap-2">
                <Button accent="red" onClick={addCustom} disabled={!newLabel.trim()}>Add</Button>
                <Button accent="slate" variant="ghost" onClick={() => { setShowAdd(false); setNewLabel(""); }}>Cancel</Button>
              </div>
            </div>
          </Card>
        )}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 stagger">
          {list.map(renderGroup)}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Emergency Contacts"
        subtitle="Trade & service directory — 3 preference slots per category, tap any number to call"
        action={<Badge accent="red">{loading ? "…" : filledCount}</Badge>}
      />

      {loadError && (
        <div className="flex items-center justify-between gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3">
          <p className="text-sm text-red-700 flex items-center gap-2"><AlertTriangle className="w-4 h-4 flex-shrink-0" /> {loadError}</p>
          <Button accent="red" variant="soft" onClick={() => { setLoading(true); setReloadKey((k) => k + 1); }}><RefreshCw className="w-4 h-4" /> Retry</Button>
        </div>
      )}
      {saveError && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 flex-shrink-0" /> {saveError}
        </div>
      )}

      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <Card key={i} className="p-4">
              <div className="h-5 w-1/2 rounded bg-slate-100 animate-pulse" />
            </Card>
          ))}
        </div>
      ) : (
        <>
          {renderSection("Trade Contacts", "👷", TRADE)}
          {renderSection("Service Contacts", "🔧", serviceGroups)}
        </>
      )}
    </div>
  );
}
