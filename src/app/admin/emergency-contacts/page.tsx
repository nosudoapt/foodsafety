"use client";

import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";
import {
  getSessionUser,
  getProfileContext,
  readLocal,
  writeLocal,
} from "@/lib/admin-store";

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

interface ContactGroup {
  id: string;
  label: string;
  icon: string;
  maxSlots: number;
}

const tradeContacts: ContactGroup[] = [
  { id: "electrician", label: "Electrician", icon: "\u26a1", maxSlots: 3 },
  { id: "plumber", label: "Plumber", icon: "\U0001f527", maxSlots: 3 },
  { id: "handyman", label: "Handyman", icon: "\U0001f528", maxSlots: 3 },
  { id: "hvac", label: "HVAC / Cooler & Freezer Repairs", icon: "\u2744\ufe0f", maxSlots: 3 },
];

const defaultServiceContacts: ContactGroup[] = [
  { id: "grease_trap", label: "Grease Trap", icon: "\U0001f6e2\ufe0f", maxSlots: 1 },
  { id: "pest_control", label: "Pest Control", icon: "\U0001f41b", maxSlots: 1 },
  { id: "canadian_linen", label: "Canadian Linen", icon: "\U0001f454", maxSlots: 1 },
  { id: "internet_provider", label: "Internet Provider", icon: "\U0001f310", maxSlots: 1 },
  { id: "security_system", label: "Security System", icon: "\U0001f512", maxSlots: 1 },
  { id: "hoods_repair", label: "Hoods Repair & Cleaning", icon: "\U0001f9f9", maxSlots: 1 },
  { id: "fire_suppression", label: "Fire Suppression Services", icon: "\U0001f525", maxSlots: 1 },
];

const STORAGE_KEY = "btb-emergency-contacts";

function createContact(): Contact {
  return {
    id: Date.now().toString() + Math.random().toString(36).slice(2, 7),
    company: "",
    phone1: "",
    phone2: "",
    phone3: "",
    contactName: "",
    email: "",
    notes: "",
  };
}

export default function EmergencyContactsPage() {
  const [contacts, setContacts] = useState<Record<string, Contact[]>>({});
  const [customServices, setCustomServices] = useState<ContactGroup[]>([]);
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({});
  const [showAddService, setShowAddService] = useState(false);
  const [newServiceName, setNewServiceName] = useState("");
  const [mounted, setMounted] = useState(false);
  const [editingLabel, setEditingLabel] = useState<string | null>(null);
  const [editLabelValue, setEditLabelValue] = useState("");

  useEffect(() => {
    let cancelled = false;
    const raf = requestAnimationFrame(() => {
      void (async () => {
        setMounted(true);
        const user = await getSessionUser();
        if (cancelled) return;
        if (user) {
          const { data, error } = await supabase
            .from("emergency_contacts")
            .select("*")
            .eq("user_id", user.id)
            .order("created_at", { ascending: false });
          if (!cancelled && !error && data) {
            const grouped: Record<string, Contact[]> = {};
            for (const row of data) {
              const groupId = String(row.category);
              if (!grouped[groupId]) grouped[groupId] = [];
              grouped[groupId].push({
                id: String(row.id),
                company: String(row.company_name || ""),
                phone1: String(row.phone_1 || ""),
                phone2: String(row.phone_2 || ""),
                phone3: String(row.phone_3 || ""),
                contactName: String(row.contact_name || ""),
                email: String(row.email || ""),
                notes: String(row.notes || ""),
              });
            }
            setContacts(grouped);
            // custom groups: category starting with custom_
            const custom: ContactGroup[] = Object.keys(grouped)
              .filter((id) => id.startsWith("custom_"))
              .map((id) => ({
                id,
                label: grouped[id][0]?.company || id,
                icon: "📎",
                maxSlots: 1,
              }));
            setCustomServices((prev) => {
              const known = new Set(prev.map((p) => p.id));
              return [...prev, ...custom.filter((c) => !known.has(c.id))];
            });
            writeLocal(STORAGE_KEY, { contacts: grouped, customServices: custom });
            return;
          }
        }
        if (!cancelled) {
          const stored = readLocal<{
            contacts?: Record<string, Contact[]>;
            customServices?: ContactGroup[];
          }>(STORAGE_KEY, {});
          if (stored.contacts) setContacts(stored.contacts);
          if (stored.customServices) setCustomServices(stored.customServices);
        }
      })();
    });
    return () => {
      cancelled = true;
      cancelAnimationFrame(raf);
    };
  }, []);

  useEffect(() => {
    if (!mounted) return;
    writeLocal(STORAGE_KEY, { contacts, customServices });
    void (async () => {
      const user = await getSessionUser();
      if (!user) return;
      const ctx = await getProfileContext();
      // Sync only contacts that have data (company or phone)
      const rows: Record<string, unknown>[] = [];
      for (const [groupId, list] of Object.entries(contacts)) {
        for (const c of list) {
          if (!c.company && !c.phone1 && !c.contactName && !c.email) continue;
          rows.push({
            id: c.id,
            user_id: user.id,
            restaurant_name: ctx.restaurantName,
            category: groupId,
            company_name: c.company || "(unnamed)",
            phone_1: c.phone1 || null,
            phone_2: c.phone2 || null,
            phone_3: c.phone3 || null,
            contact_name: c.contactName,
            email: c.email,
            notes: c.notes,
            updated_at: new Date().toISOString(),
          });
        }
      }
      if (rows.length === 0) return;
      await supabase.from("emergency_contacts").upsert(rows, { onConflict: "id" });
    })();
  }, [contacts, customServices, mounted]);

  const allServiceContacts = [...defaultServiceContacts, ...customServices];

  const updateContact = (groupId: string, index: number, field: keyof Contact, value: string) => {
    setContacts((prev) => {
      const group = [...(prev[groupId] || [])];
      while (group.length <= index) {
        group.push(createContact());
      }
      group[index] = { ...group[index], [field]: value };
      return { ...prev, [groupId]: group };
    });
  };

  const addCustomService = () => {
    if (!newServiceName.trim()) return;
    const newGroup: ContactGroup = {
      id: "custom_" + Date.now(),
      label: newServiceName.trim(),
      icon: "\U0001f4ce",
      maxSlots: 1,
    };
    setCustomServices((prev) => [...prev, newGroup]);
    setNewServiceName("");
    setShowAddService(false);
  };

  const removeCustomService = (id: string) => {
    if (!confirm("Remove this custom service?")) return;
    setCustomServices((prev) => prev.filter((s) => s.id !== id));
    setContacts((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
  };

  const toggleGroup = (id: string) => {
    setOpenGroups((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const startEditLabel = (group: ContactGroup) => {
    setEditingLabel(group.id);
    setEditLabelValue(group.label);
  };

  const saveEditLabel = () => {
    if (editingLabel && editLabelValue.trim()) {
      setCustomServices((prev) =>
        prev.map((s) => (s.id === editingLabel ? { ...s, label: editLabelValue.trim() } : s))
      );
    }
    setEditingLabel(null);
    setEditLabelValue("");
  };

  const renderContactRow = (group: ContactGroup, index: number) => {
    const groupId = group.id;
    const contact = contacts[groupId]?.[index] || { id: "", company: "", phone1: "", phone2: "", phone3: "", contactName: "", email: "", notes: "" };
    const hasData = contact.company || contact.phone1 || contact.contactName || contact.email;

    return (
      <div key={index} className={`rounded-lg border p-3 ${hasData ? "border-gray-200 bg-gray-50" : "border-dashed border-gray-200 bg-white"}`}>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
          <div>
            <label className="block text-[10px] font-medium text-gray-500 mb-0.5">Company Name</label>
            <input
              type="text"
              value={contact.company}
              onChange={(e) => updateContact(groupId, index, "company", e.target.value)}
              placeholder="Company name"
              className="w-full px-2 py-1.5 border border-gray-200 rounded text-sm text-gray-900 bg-white"
            />
          </div>
          <div>
            <label className="block text-[10px] font-medium text-gray-500 mb-0.5">Phone 1</label>
            <input
              type="tel"
              value={contact.phone1}
              onChange={(e) => updateContact(groupId, index, "phone1", e.target.value)}
              placeholder="(555) 123-4567"
              className="w-full px-2 py-1.5 border border-gray-200 rounded text-sm text-gray-900 bg-white"
            />
          </div>
          <div>
            <label className="block text-[10px] font-medium text-gray-500 mb-0.5">Phone 2</label>
            <input
              type="tel"
              value={contact.phone2}
              onChange={(e) => updateContact(groupId, index, "phone2", e.target.value)}
              placeholder="(555) 234-5678"
              className="w-full px-2 py-1.5 border border-gray-200 rounded text-sm text-gray-900 bg-white"
            />
          </div>
          <div>
            <label className="block text-[10px] font-medium text-gray-500 mb-0.5">Phone 3</label>
            <input
              type="tel"
              value={contact.phone3}
              onChange={(e) => updateContact(groupId, index, "phone3", e.target.value)}
              placeholder="(555) 345-6789"
              className="w-full px-2 py-1.5 border border-gray-200 rounded text-sm text-gray-900 bg-white"
            />
          </div>
          <div>
            <label className="block text-[10px] font-medium text-gray-500 mb-0.5">Contact Name</label>
            <input
              type="text"
              value={contact.contactName}
              onChange={(e) => updateContact(groupId, index, "contactName", e.target.value)}
              placeholder="Contact person"
              className="w-full px-2 py-1.5 border border-gray-200 rounded text-sm text-gray-900 bg-white"
            />
          </div>
          <div>
            <label className="block text-[10px] font-medium text-gray-500 mb-0.5">Email</label>
            <input
              type="email"
              value={contact.email}
              onChange={(e) => updateContact(groupId, index, "email", e.target.value)}
              placeholder="email@example.com"
              className="w-full px-2 py-1.5 border border-gray-200 rounded text-sm text-gray-900 bg-white"
            />
          </div>
        </div>
        <div className="mt-2">
          <label className="block text-[10px] font-medium text-gray-500 mb-0.5">Notes</label>
          <input
            type="text"
            value={contact.notes}
            onChange={(e) => updateContact(groupId, index, "notes", e.target.value)}
            placeholder="Additional notes"
            className="w-full px-2 py-1.5 border border-gray-200 rounded text-sm text-gray-900 bg-white"
          />
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Emergency Contacts</h1>
        <p className="text-sm text-gray-500">Trade and service contacts for your restaurant</p>
      </div>

      {/* Trade Contacts */}
      <div>
        <h2 className="text-lg font-bold text-gray-900 mb-3 flex items-center gap-2">
          <span className="text-xl">\U0001f477</span> Trade Contacts
        </h2>
        <div className="space-y-3">
          {tradeContacts.map((group) => {
            const isOpen = openGroups[group.id] ?? false;
            return (
              <div key={group.id} className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                <button
                  onClick={() => toggleGroup(group.id)}
                  className="w-full flex items-center justify-between px-4 py-3 hover:bg-gray-50 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <span className="text-xl">{group.icon}</span>
                    <div className="text-left">
                      <h3 className="font-bold text-gray-900 text-sm">{group.label}</h3>
                      <p className="text-[10px] text-gray-500">{group.maxSlots} option{group.maxSlots !== 1 ? "s" : ""}</p>
                    </div>
                  </div>
                  <svg
                    className={`w-5 h-5 text-gray-400 transition-transform ${isOpen ? "rotate-180" : ""}`}
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </button>
                {isOpen && (
                  <div className="border-t border-gray-100 px-4 py-3 space-y-3">
                    {Array.from({ length: group.maxSlots }, (_, i) => renderContactRow(group, i))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Service Contacts */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-bold text-gray-900 flex items-center gap-2">
            <span className="text-xl">\U0001f527</span> Service Contacts
          </h2>
          <button
            onClick={() => setShowAddService(true)}
            className="bg-red-600 text-white px-3 py-1.5 rounded-lg text-xs font-semibold hover:bg-red-700 transition-colors flex items-center gap-1"
          >
            <span>+</span> Add Custom
          </button>
        </div>
        <div className="space-y-3">
          {allServiceContacts.map((group) => {
            const isOpen = openGroups[group.id] ?? false;
            const isCustom = group.id.startsWith("custom_");
            return (
              <div key={group.id} className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                <button
                  onClick={() => toggleGroup(group.id)}
                  className="w-full flex items-center justify-between px-4 py-3 hover:bg-gray-50 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <span className="text-xl">{group.icon}</span>
                    <div className="text-left">
                      {editingLabel === group.id ? (
                        <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                          <input
                            type="text"
                            value={editLabelValue}
                            onChange={(e) => setEditLabelValue(e.target.value)}
                            onBlur={saveEditLabel}
                            onKeyDown={(e) => e.key === "Enter" && saveEditLabel()}
                            className="px-2 py-0.5 border border-gray-300 rounded text-sm text-gray-900 bg-white"
                            autoFocus
                          />
                        </div>
                      ) : (
                        <h3 className="font-bold text-gray-900 text-sm">{group.label}</h3>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {isCustom && (
                      <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                        <button
                          onClick={() => startEditLabel(group)}
                          className="text-xs text-gray-400 hover:text-blue-500 px-1"
                        >
                          \u270f\ufe0f
                        </button>
                        <button
                          onClick={() => removeCustomService(group.id)}
                          className="text-xs text-gray-400 hover:text-red-500 px-1"
                        >
                          \U0001f5d1\ufe0f
                        </button>
                      </div>
                    )}
                    <svg
                      className={`w-5 h-5 text-gray-400 transition-transform ${isOpen ? "rotate-180" : ""}`}
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                  </div>
                </button>
                {isOpen && (
                  <div className="border-t border-gray-100 px-4 py-3">
                    {renderContactRow(group, 0)}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Add Custom Service Modal */}
      {showAddService && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl p-6 w-full max-w-sm">
            <h3 className="font-bold text-gray-900 text-lg mb-4">Add Custom Service</h3>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Service Name</label>
              <input
                type="text"
                value={newServiceName}
                onChange={(e) => setNewServiceName(e.target.value)}
                placeholder="e.g. Landscaping"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-gray-900 bg-white text-sm"
                autoFocus
                onKeyDown={(e) => e.key === "Enter" && addCustomService()}
              />
            </div>
            <div className="flex gap-2 mt-6">
              <button
                onClick={() => setShowAddService(false)}
                className="flex-1 px-4 py-2 bg-gray-100 text-gray-700 rounded-lg font-medium hover:bg-gray-200 text-sm"
              >
                Cancel
              </button>
              <button
                onClick={addCustomService}
                disabled={!newServiceName.trim()}
                className="flex-1 px-4 py-2 bg-red-600 text-white rounded-lg font-medium hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed text-sm"
              >
                Add
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}