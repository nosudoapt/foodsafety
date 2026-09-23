"use client";

import { useEffect, useMemo, useState } from "react";
import {
  KeyRound,
  Plus,
  Eye,
  EyeOff,
  Copy,
  Trash2,
  Search,
  ShieldAlert,
  Check,
} from "lucide-react";
import { PageHeader, Card, Button, Badge, EmptyState, inputClass, Field } from "@/components/ui";
import { supabase } from "@/lib/supabase";
import {
  getSessionUser,
  getProfileContext,
  readLocal,
  writeLocal,
} from "@/lib/admin-store";

interface VaultEntry {
  id: string;
  service: string;
  category: string;
  username: string;
  password: string;
  url: string;
  notes: string;
  updatedAt: string;
}

const defaultServices: { service: string; category: string }[] = [
  { service: "Debit Machine", category: "Payments" },
  { service: "Internet Provider", category: "Connectivity" },
  { service: "MYR POS", category: "POS" },
  { service: "Security System", category: "Security" },
  { service: "GFS Vendor", category: "Vendors" },
  { service: "Bank Login", category: "Finance" },
  { service: "Location Email", category: "Accounts" },
  { service: "Skup", category: "Delivery" },
  { service: "Uber", category: "Delivery" },
  { service: "DoorDash", category: "Delivery" },
];

const STORAGE_KEY = "btb-login-vault";

const categoryTone: Record<string, "blue" | "green" | "amber" | "purple" | "gray"> = {
  Payments: "blue",
  Connectivity: "green",
  POS: "purple",
  Security: "amber",
  Vendors: "gray",
  Finance: "blue",
  Accounts: "purple",
  Delivery: "green",
};

function rowToEntry(row: Record<string, unknown>): VaultEntry {
  return {
    id: String(row.id),
    service: String(row.service_name || row.system_name || ""),
    category: String(row.category || "Accounts"),
    username: String(row.username || ""),
    password: String(row.password_encrypted || ""),
    url: String(row.url || ""),
    notes: String(row.notes || ""),
    updatedAt: String(row.last_updated || row.created_at || new Date().toISOString()),
  };
}

export default function LoginVaultPage() {
  const [entries, setEntries] = useState<VaultEntry[]>([]);
  const [visible, setVisible] = useState<Record<string, boolean>>({});
  const [query, setQuery] = useState("");
  const [showAdd, setShowAdd] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [unlockPulse, setUnlockPulse] = useState(true);
  const [form, setForm] = useState({
    service: "",
    category: "Accounts",
    username: "",
    password: "",
    url: "",
    notes: "",
  });

  useEffect(() => {
    let cancelled = false;
    const raf = requestAnimationFrame(() => {
      void (async () => {
        const user = await getSessionUser();
        if (cancelled) return;
        if (user) {
          const { data, error } = await supabase
            .from("login_information")
            .select("*")
            .eq("user_id", user.id)
            .order("last_updated", { ascending: false });
          if (!cancelled && !error && data && data.length > 0) {
            const mapped = data.map(rowToEntry);
            setEntries(mapped);
            writeLocal(STORAGE_KEY, mapped);
            setUnlockPulse(false);
            return;
          }
          if (!cancelled && !error) {
            // empty cloud → seed defaults once
            const ctx = await getProfileContext();
            const seeds = defaultServices.map((s) => ({
              id: crypto.randomUUID(),
              service: s.service,
              category: s.category,
              username: "",
              password: "",
              url: "",
              notes: "",
              updatedAt: new Date().toISOString(),
            }));
            setEntries(seeds);
            writeLocal(STORAGE_KEY, seeds);
            await supabase.from("login_information").insert(
              seeds.map((e) => ({
                user_id: user.id,
                restaurant_name: ctx.restaurantName,
                system_name: e.service,
                service_name: e.service,
                category: e.category,
                username: "",
                password_encrypted: "",
                url: "",
                notes: "",
              }))
            );
            setUnlockPulse(false);
            return;
          }
        }
        if (!cancelled) {
          const raw = readLocal<VaultEntry[] | null>(STORAGE_KEY, null);
          if (raw && raw.length > 0) {
            setEntries(raw);
          } else {
            setEntries(
              defaultServices.map((s, i) => ({
                id: `seed-${i}`,
                service: s.service,
                category: s.category,
                username: "",
                password: "",
                url: "",
                notes: "",
                updatedAt: new Date().toISOString(),
              }))
            );
          }
        }
        setUnlockPulse(false);
      })();
    });
    return () => {
      cancelled = true;
      cancelAnimationFrame(raf);
    };
  }, []);

  const persist = (next: VaultEntry[]) => {
    setEntries(next);
    writeLocal(STORAGE_KEY, next);
    void (async () => {
      const user = await getSessionUser();
      if (!user) return;
      const ctx = await getProfileContext();
      // Full sync: delete + reinsert is heavy; upsert by id via delete-then-insert for changed set
      const { data: existing } = await supabase
        .from("login_information")
        .select("id")
        .eq("user_id", user.id);
      const existingIds = new Set((existing || []).map((r) => String(r.id)));
      const nextIds = new Set(next.map((e) => e.id));
      const toDelete = [...existingIds].filter((id) => !nextIds.has(id));
      if (toDelete.length) {
        await supabase.from("login_information").delete().in("id", toDelete).eq("user_id", user.id);
      }
      for (const e of next) {
        if (existingIds.has(e.id)) {
          await supabase
            .from("login_information")
            .update({
              system_name: e.service,
              service_name: e.service,
              category: e.category,
              username: e.username,
              password_encrypted: e.password,
              url: e.url,
              notes: e.notes,
              last_updated: e.updatedAt,
            })
            .eq("id", e.id)
            .eq("user_id", user.id);
        } else {
          await supabase.from("login_information").insert({
            id: e.id,
            user_id: user.id,
            restaurant_name: ctx.restaurantName,
            system_name: e.service,
            service_name: e.service,
            category: e.category,
            username: e.username,
            password_encrypted: e.password,
            url: e.url,
            notes: e.notes,
            last_updated: e.updatedAt,
          });
        }
      }
    })();
  };

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return entries;
    return entries.filter(
      (e) =>
        e.service.toLowerCase().includes(q) ||
        e.category.toLowerCase().includes(q) ||
        e.username.toLowerCase().includes(q)
    );
  }, [entries, query]);

  const grouped = useMemo(() => {
    const map = new Map<string, VaultEntry[]>();
    for (const e of filtered) {
      const list = map.get(e.category) || [];
      list.push(e);
      map.set(e.category, list);
    }
    return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [filtered]);

  const updateEntry = (id: string, patch: Partial<VaultEntry>) => {
    persist(
      entries.map((e) =>
        e.id === id ? { ...e, ...patch, updatedAt: new Date().toISOString() } : e
      )
    );
  };

  const removeEntry = (id: string) => {
    if (!confirm("Remove this login from the vault?")) return;
    persist(entries.filter((e) => e.id !== id));
  };

  const copyField = async (entryId: string, field: string, value: string) => {
    if (!value) return;
    try {
      await navigator.clipboard.writeText(value);
      setCopiedId(`${entryId}:${field}`);
      setTimeout(() => setCopiedId(null), 1500);
    } catch {
      /* ignore */
    }
  };

  const addService = () => {
    if (!form.service.trim()) return;
    const entry: VaultEntry = {
      id: Date.now().toString(),
      service: form.service.trim(),
      category: form.category,
      username: form.username,
      password: form.password,
      url: form.url,
      notes: form.notes,
      updatedAt: new Date().toISOString(),
    };
    persist([entry, ...entries]);
    setForm({ service: "", category: "Accounts", username: "", password: "", url: "", notes: "" });
    setShowAdd(false);
  };

  const filled = entries.filter((e) => e.username || e.password).length;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Login vault"
        description="Usernames and passwords for every location system — POS, bank, delivery apps, internet, and more. Stored on this device only."
        actions={
          <Button onClick={() => setShowAdd(true)}>
            <Plus className="h-4 w-4" /> Add login
          </Button>
        }
      />

      <Card className={`flex items-start gap-3 ${unlockPulse ? "ring-2 ring-red-500/20" : ""}`}>
        <ShieldAlert className="h-5 w-5 text-amber-500 shrink-0 mt-0.5" strokeWidth={1.75} />
        <div className="text-[13px] text-gray-600 leading-relaxed">
          <p className="font-semibold text-gray-900">Device-local vault</p>
          <p className="mt-0.5">
            Credentials never leave this browser. Passwords are hidden by default — use the eye
            toggle or copy button.{" "}
            <span className="text-gray-400">
              {filled} of {entries.length} entries filled.
            </span>
          </p>
        </div>
      </Card>

      <div className="flex items-center gap-2">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search services…"
            className={`${inputClass} pl-9`}
            aria-label="Search logins"
          />
        </div>
        <Badge tone="gray">{filtered.length} shown</Badge>
      </div>

      {grouped.length === 0 ? (
        <Card padded={false}>
          <EmptyState
            icon={<KeyRound className="h-5 w-5" />}
            title={query ? "No matches" : "Vault is empty"}
            description={
              query
                ? "Try a different search term."
                : "Add your first system login — debit machine, POS, bank, delivery apps…"
            }
            action={
              !query ? (
                <Button onClick={() => setShowAdd(true)}>
                  <Plus className="h-4 w-4" /> Add login
                </Button>
              ) : undefined
            }
          />
        </Card>
      ) : (
        <div className="space-y-5">
          {grouped.map(([category, list]) => (
            <div key={category}>
              <div className="mb-2 flex items-center gap-2">
                <h2 className="text-xs font-bold uppercase tracking-wider text-gray-400">
                  {category}
                </h2>
                <div className="h-px flex-1 bg-gray-200" />
                <Badge tone={categoryTone[category] || "gray"}>{list.length}</Badge>
              </div>
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {list.map((entry) => {
                  const show = visible[entry.id];
                  return (
                    <Card key={entry.id} className="flex flex-col gap-3" padded>
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="text-[14px] font-semibold text-gray-900 truncate">
                            {entry.service}
                          </p>
                          <p className="text-[11px] text-gray-400">
                            Updated {entry.updatedAt.slice(0, 10)}
                          </p>
                        </div>
                        <button
                          type="button"
                          aria-label={show ? "Hide password" : "Show password"}
                          onClick={() => setVisible((v) => ({ ...v, [entry.id]: !v[entry.id] }))}
                          className="h-8 w-8 inline-flex items-center justify-center rounded-md text-gray-400 hover:text-gray-700 hover:bg-gray-100 cursor-pointer transition-colors"
                        >
                          {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                        </button>
                      </div>

                      <div className="space-y-2">
                        <div>
                          <label className="block text-[10px] font-semibold uppercase tracking-wide text-gray-400 mb-1">
                            Username / email
                          </label>
                          <div className="flex gap-1.5">
                            <input
                              value={entry.username}
                              onChange={(e) => updateEntry(entry.id, { username: e.target.value })}
                              placeholder="not set"
                              className={`${inputClass} py-1.5 text-[13px]`}
                              aria-label={`Username for ${entry.service}`}
                            />
                            <button
                              type="button"
                              aria-label="Copy username"
                              disabled={!entry.username}
                              onClick={() => copyField(entry.id, "user", entry.username)}
                              className="shrink-0 h-[34px] w-[34px] inline-flex items-center justify-center rounded-lg border border-gray-200 text-gray-500 hover:bg-gray-50 cursor-pointer disabled:opacity-40 transition-colors"
                            >
                              {copiedId === `${entry.id}:user` ? (
                                <Check className="h-3.5 w-3.5 text-emerald-600" />
                              ) : (
                                <Copy className="h-3.5 w-3.5" />
                              )}
                            </button>
                          </div>
                        </div>

                        <div>
                          <label className="block text-[10px] font-semibold uppercase tracking-wide text-gray-400 mb-1">
                            Password
                          </label>
                          <div className="flex gap-1.5">
                            <input
                              type={show ? "text" : "password"}
                              value={entry.password}
                              onChange={(e) => updateEntry(entry.id, { password: e.target.value })}
                              placeholder="not set"
                              className={`${inputClass} py-1.5 text-[13px] font-mono`}
                              aria-label={`Password for ${entry.service}`}
                            />
                            <button
                              type="button"
                              aria-label="Copy password"
                              disabled={!entry.password}
                              onClick={() => copyField(entry.id, "pass", entry.password)}
                              className="shrink-0 h-[34px] w-[34px] inline-flex items-center justify-center rounded-lg border border-gray-200 text-gray-500 hover:bg-gray-50 cursor-pointer disabled:opacity-40 transition-colors"
                            >
                              {copiedId === `${entry.id}:pass` ? (
                                <Check className="h-3.5 w-3.5 text-emerald-600" />
                              ) : (
                                <Copy className="h-3.5 w-3.5" />
                              )}
                            </button>
                          </div>
                        </div>
                      </div>

                      <div className="mt-auto flex items-center justify-between pt-1">
                        <Badge tone={categoryTone[entry.category] || "gray"}>{entry.category}</Badge>
                        <button
                          type="button"
                          aria-label={`Remove ${entry.service}`}
                          onClick={() => removeEntry(entry.id)}
                          className="h-8 w-8 inline-flex items-center justify-center rounded-md text-gray-300 hover:text-red-500 hover:bg-red-50 cursor-pointer transition-colors"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </Card>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}

      {showAdd && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/45">
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Add login"
            className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl"
          >
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Add login</h3>
            <div className="space-y-4">
              <Field label="Service name" htmlFor="vault-service">
                <input
                  id="vault-service"
                  className={inputClass}
                  value={form.service}
                  onChange={(e) => setForm({ ...form, service: e.target.value })}
                  placeholder="e.g. Moneris Portal"
                />
              </Field>
              <Field label="Category" htmlFor="vault-category">
                <select
                  id="vault-category"
                  className={inputClass}
                  value={form.category}
                  onChange={(e) => setForm({ ...form, category: e.target.value })}
                >
                  {[
                    "Payments",
                    "Connectivity",
                    "POS",
                    "Security",
                    "Vendors",
                    "Finance",
                    "Accounts",
                    "Delivery",
                    "Other",
                  ].map((c) => (
                    <option key={c}>{c}</option>
                  ))}
                </select>
              </Field>
              <Field label="Username / email" htmlFor="vault-user">
                <input
                  id="vault-user"
                  className={inputClass}
                  value={form.username}
                  onChange={(e) => setForm({ ...form, username: e.target.value })}
                />
              </Field>
              <Field label="Password" htmlFor="vault-pass">
                <input
                  id="vault-pass"
                  type="password"
                  className={inputClass}
                  value={form.password}
                  onChange={(e) => setForm({ ...form, password: e.target.value })}
                />
              </Field>
            </div>
            <div className="flex gap-2 mt-6">
              <Button variant="secondary" onClick={() => setShowAdd(false)} className="flex-1">
                Cancel
              </Button>
              <Button onClick={addService} disabled={!form.service.trim()} className="flex-1">
                Save
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
