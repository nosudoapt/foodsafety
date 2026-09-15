"use client";

import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";

const CANADIAN_ALLERGENS = [
  "Peanuts",
  "Tree nuts",
  "Milk",
  "Eggs",
  "Wheat",
  "Soybeans",
  "Fish",
  "Crustacean shellfish",
  "Sesame",
  "Mustard",
  "Sulphites",
  "Lentils",
  "Chickpeas",
  "Beans",
] as const;

const ALLERGEN_COLORS: Record<string, { bg: string; text: string; border: string }> = {
  Peanuts: { bg: "bg-amber-100", text: "text-amber-800", border: "border-amber-300" },
  "Tree nuts": { bg: "bg-orange-100", text: "text-orange-800", border: "border-orange-300" },
  Milk: { bg: "bg-blue-100", text: "text-blue-800", border: "border-blue-300" },
  Eggs: { bg: "bg-yellow-100", text: "text-yellow-800", border: "border-yellow-300" },
  Wheat: { bg: "bg-amber-50", text: "text-amber-700", border: "border-amber-200" },
  Soybeans: { bg: "bg-green-100", text: "text-green-800", border: "border-green-300" },
  Fish: { bg: "bg-cyan-100", text: "text-cyan-800", border: "border-cyan-300" },
  "Crustacean shellfish": { bg: "bg-red-100", text: "text-red-800", border: "border-red-300" },
  Sesame: { bg: "bg-stone-100", text: "text-stone-800", border: "border-stone-300" },
  Mustard: { bg: "bg-lime-100", text: "text-lime-800", border: "border-lime-300" },
  Sulphites: { bg: "bg-purple-100", text: "text-purple-800", border: "border-purple-300" },
  Lentils: { bg: "bg-teal-100", text: "text-teal-800", border: "border-teal-300" },
  Chickpeas: { bg: "bg-rose-100", text: "text-rose-800", border: "border-rose-300" },
  Beans: { bg: "bg-indigo-100", text: "text-indigo-800", border: "border-indigo-300" },
};

interface AllergenRecord {
  id: string;
  user_id: string;
  restaurant_name: string;
  menu_item: string;
  allergens: string[];
  notes: string;
  created_at: string;
  updated_at: string;
}

const emptyForm = {
  restaurant_name: "",
  menu_item: "",
  allergens: [] as string[],
  notes: "",
};

export default function AllergensPage() {
  const [records, setRecords] = useState<AllergenRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formData, setFormData] = useState(emptyForm);
  const [view, setView] = useState<"list" | "matrix">("list");
  const [search, setSearch] = useState("");
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [filterAllergen, setFilterAllergen] = useState<string>("");

  useEffect(() => {
    fetchRecords();
  }, []);

  const fetchRecords = async () => {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (!session) return;

    const { data } = await supabase
      .from("allergen_records")
      .select("*")
      .eq("user_id", session.user.id)
      .order("created_at", { ascending: false });

    setRecords(data || []);
    setLoading(false);
  };

  const toggleAllergen = (allergen: string) => {
    setFormData((prev) => ({
      ...prev,
      allergens: prev.allergens.includes(allergen)
        ? prev.allergens.filter((a) => a !== allergen)
        : [...prev.allergens, allergen],
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (!session) return;

    const payload = {
      user_id: session.user.id,
      restaurant_name: formData.restaurant_name,
      menu_item: formData.menu_item,
      allergens: formData.allergens,
      notes: formData.notes,
      updated_at: new Date().toISOString(),
    };

    if (editingId) {
      const { error } = await supabase
        .from("allergen_records")
        .update(payload)
        .eq("id", editingId);
      if (!error) resetForm();
    } else {
      const { error } = await supabase.from("allergen_records").insert({
        ...payload,
        created_at: new Date().toISOString(),
      });
      if (!error) resetForm();
    }

    fetchRecords();
  };

  const handleEdit = (record: AllergenRecord) => {
    setEditingId(record.id);
    setFormData({
      restaurant_name: record.restaurant_name,
      menu_item: record.menu_item,
      allergens: record.allergens || [],
      notes: record.notes || "",
    });
    setShowForm(true);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const handleDelete = async (id: string) => {
    const { error } = await supabase.from("allergen_records").delete().eq("id", id);
    if (!error) {
      setDeleteConfirm(null);
      fetchRecords();
    }
  };

  const resetForm = () => {
    setFormData(emptyForm);
    setEditingId(null);
    setShowForm(false);
  };

  const filteredRecords = records.filter((r) => {
    const matchesSearch =
      r.menu_item.toLowerCase().includes(search.toLowerCase()) ||
      r.restaurant_name.toLowerCase().includes(search.toLowerCase());
    const matchesFilter = !filterAllergen || (r.allergens && r.allergens.includes(filterAllergen));
    return matchesSearch && matchesFilter;
  });

  const allergenSummary = CANADIAN_ALLERGENS.map((a) => ({
    name: a,
    count: records.filter((r) => r.allergens && r.allergens.includes(a)).length,
  })).filter((a) => a.count > 0);

  return (
    <div>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Allergen Management</h1>
          <p className="text-gray-600 mt-1">Track menu item allergens for your restaurant</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setView("list")}
            className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
              view === "list" ? "bg-green-600 text-white" : "bg-gray-100 text-gray-700 hover:bg-gray-200"
            }`}
          >
            List
          </button>
          <button
            onClick={() => setView("matrix")}
            className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
              view === "matrix" ? "bg-green-600 text-white" : "bg-gray-100 text-gray-700 hover:bg-gray-200"
            }`}
          >
            Matrix
          </button>
          <button
            onClick={() => {
              resetForm();
              setShowForm(!showForm);
            }}
            className="bg-green-600 text-white px-4 py-2 rounded-lg font-semibold hover:bg-green-700 transition-colors flex items-center gap-2"
          >
            <span>+</span> Add Item
          </button>
        </div>
      </div>

      {/* Summary */}
      {allergenSummary.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 p-4 mb-6">
          <h2 className="text-sm font-semibold text-gray-700 mb-3">Allergen Overview</h2>
          <div className="flex flex-wrap gap-2">
            {allergenSummary.map((a) => {
              const colors = ALLERGEN_COLORS[a.name] || { bg: "bg-gray-100", text: "text-gray-700", border: "border-gray-300" };
              return (
                <span
                  key={a.name}
                  className={`px-2 py-1 rounded-full text-xs font-medium ${colors.bg} ${colors.text} border ${colors.border}`}
                >
                  {a.name}: {a.count}
                </span>
              );
            })}
          </div>
        </div>
      )}

      {/* Form */}
      {showForm && (
        <div className="bg-white rounded-xl border border-gray-200 p-6 mb-8">
          <h2 className="text-lg font-semibold mb-4">{editingId ? "Edit Menu Item" : "New Menu Item"}</h2>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Restaurant Name</label>
                <input
                  type="text"
                  value={formData.restaurant_name}
                  onChange={(e) => setFormData({ ...formData, restaurant_name: e.target.value })}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500"
                  placeholder="e.g. My Restaurant"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Menu Item</label>
                <input
                  type="text"
                  value={formData.menu_item}
                  onChange={(e) => setFormData({ ...formData, menu_item: e.target.value })}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500"
                  placeholder="e.g. Caesar Salad"
                  required
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Allergens ({formData.allergens.length} selected)
              </label>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-7 gap-2">
                {CANADIAN_ALLERGENS.map((allergen) => {
                  const selected = formData.allergens.includes(allergen);
                  const colors = ALLERGEN_COLORS[allergen];
                  return (
                    <button
                      key={allergen}
                      type="button"
                      onClick={() => toggleAllergen(allergen)}
                      className={`px-3 py-2 rounded-lg text-sm font-medium border-2 transition-all ${
                        selected
                          ? `${colors.bg} ${colors.text} ${colors.border} ring-2 ring-offset-1 ring-green-500`
                          : "bg-white text-gray-600 border-gray-200 hover:border-gray-400"
                      }`}
                    >
                      {selected && "✓ "}
                      {allergen}
                    </button>
                  );
                })}
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
              <textarea
                value={formData.notes}
                onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500"
                placeholder="Optional notes (e.g. contains traces of...)"
                rows={2}
              />
            </div>

            <div className="flex gap-3">
              <button
                type="submit"
                className="bg-green-600 text-white px-6 py-2 rounded-lg font-semibold hover:bg-green-700 transition-colors"
              >
                {editingId ? "Update Item" : "Save Item"}
              </button>
              <button
                type="button"
                onClick={resetForm}
                className="bg-gray-100 text-gray-700 px-6 py-2 rounded-lg font-semibold hover:bg-gray-200 transition-colors"
              >
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3 mb-6">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search menu items or restaurants..."
          className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500"
        />
        <select
          value={filterAllergen}
          onChange={(e) => setFilterAllergen(e.target.value)}
          className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500"
        >
          <option value="">All Allergens</option>
          {CANADIAN_ALLERGENS.map((a) => (
            <option key={a} value={a}>
              {a}
            </option>
          ))}
        </select>
      </div>

      {/* List View */}
      {view === "list" && (
        <div className="bg-white rounded-xl border border-gray-200">
          <div className="p-4 border-b border-gray-200">
            <h2 className="font-semibold text-gray-900">
              Menu Items ({filteredRecords.length})
            </h2>
          </div>

          {loading ? (
            <div className="p-8 text-center text-gray-500">Loading...</div>
          ) : filteredRecords.length === 0 ? (
            <div className="p-8 text-center text-gray-500">
              {records.length === 0
                ? 'No menu items yet. Tap "Add Item" to start.'
                : "No items match your search."}
            </div>
          ) : (
            <div className="divide-y divide-gray-200">
              {filteredRecords.map((record) => (
                <div key={record.id} className="p-4 hover:bg-gray-50">
                  <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <h3 className="font-semibold text-gray-900 truncate">{record.menu_item}</h3>
                        <span className="text-xs text-gray-500 bg-gray-100 px-2 py-0.5 rounded-full whitespace-nowrap">
                          {record.restaurant_name}
                        </span>
                      </div>
                      {record.allergens && record.allergens.length > 0 ? (
                        <div className="flex flex-wrap gap-1 mt-2">
                          {record.allergens.map((allergen) => {
                            const colors = ALLERGEN_COLORS[allergen] || { bg: "bg-gray-100", text: "text-gray-700", border: "border-gray-300" };
                            return (
                              <span
                                key={allergen}
                                className={`px-2 py-0.5 rounded-full text-xs font-medium ${colors.bg} ${colors.text} border ${colors.border}`}
                              >
                                {allergen}
                              </span>
                            );
                          })}
                        </div>
                      ) : (
                        <p className="text-sm text-gray-400 mt-1">No allergens recorded</p>
                      )}
                      {record.notes && (
                        <p className="text-sm text-gray-500 mt-2 line-clamp-2">{record.notes}</p>
                      )}
                    </div>
                    <div className="flex items-center gap-2 sm:flex-shrink-0">
                      <button
                        onClick={() => handleEdit(record)}
                        className="px-3 py-1.5 text-sm font-medium text-green-700 bg-green-50 rounded-lg hover:bg-green-100 transition-colors"
                      >
                        Edit
                      </button>
                      {deleteConfirm === record.id ? (
                        <div className="flex items-center gap-1">
                          <button
                            onClick={() => handleDelete(record.id)}
                            className="px-3 py-1.5 text-sm font-medium text-white bg-red-600 rounded-lg hover:bg-red-700 transition-colors"
                          >
                            Confirm
                          </button>
                          <button
                            onClick={() => setDeleteConfirm(null)}
                            className="px-3 py-1.5 text-sm font-medium text-gray-600 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
                          >
                            Cancel
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={() => setDeleteConfirm(record.id)}
                          className="px-3 py-1.5 text-sm font-medium text-red-700 bg-red-50 rounded-lg hover:bg-red-100 transition-colors"
                        >
                          Delete
                        </button>
                      )}
                    </div>
                  </div>
                  <p className="text-xs text-gray-400 mt-2">
                    Added {new Date(record.created_at).toLocaleDateString()}
                    {record.updated_at !== record.created_at &&
                      ` · Updated ${new Date(record.updated_at).toLocaleDateString()}`}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Matrix View */}
      {view === "matrix" && (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="p-4 border-b border-gray-200">
            <h2 className="font-semibold text-gray-900">Allergen Matrix</h2>
            <p className="text-sm text-gray-500 mt-1">
              Cross-reference menu items with allergens
            </p>
          </div>

          {loading ? (
            <div className="p-8 text-center text-gray-500">Loading...</div>
          ) : filteredRecords.length === 0 ? (
            <div className="p-8 text-center text-gray-500">
              {records.length === 0
                ? 'No menu items yet. Tap "Add Item" to start.'
                : "No items match your search."}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50">
                    <th className="text-left px-4 py-3 font-semibold text-gray-700 sticky left-0 bg-gray-50 min-w-[160px]">
                      Menu Item
                    </th>
                    {CANADIAN_ALLERGENS.map((a) => (
                      <th
                        key={a}
                        className="px-2 py-3 text-center font-medium text-gray-600 min-w-[48px]"
                        title={a}
                      >
                        <span className="hidden lg:inline">{a}</span>
                        <span className="lg:hidden">{a.slice(0, 3)}</span>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {filteredRecords.map((record) => (
                    <tr key={record.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3 font-medium text-gray-900 sticky left-0 bg-white hover:bg-gray-50">
                        <div className="truncate max-w-[200px]">{record.menu_item}</div>
                        <div className="text-xs text-gray-500 truncate">{record.restaurant_name}</div>
                      </td>
                      {CANADIAN_ALLERGENS.map((allergen) => {
                        const hasIt = record.allergens && record.allergens.includes(allergen);
                        const colors = ALLERGEN_COLORS[allergen];
                        return (
                          <td key={allergen} className="px-2 py-3 text-center">
                            {hasIt ? (
                              <span
                                className={`inline-flex items-center justify-center w-6 h-6 rounded-full ${colors.bg} ${colors.text}`}
                                title={`${record.menu_item} contains ${allergen}`}
                              >
                                ✓
                              </span>
                            ) : (
                              <span className="text-gray-200">—</span>
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
