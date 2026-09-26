"use client";

import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";

interface DeliveryItem {
  name: string;
  quantity: number;
  unit: string;
}

interface DeliveryRecord {
  id: string;
  user_id: string;
  restaurant_name: string;
  supplier_name: string;
  delivery_date: string;
  items: DeliveryItem[];
  temperature: number;
  is_accepted: boolean;
  rejection_reason: string;
  notes: string;
  created_at: string;
}

export default function DeliveriesPage() {
  const [records, setRecords] = useState<DeliveryRecord[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"all" | "accepted" | "rejected">("all");
  const [rejectModal, setRejectModal] = useState<{ id: string; open: boolean }>({ id: "", open: false });
  const [rejectionReason, setRejectionReason] = useState("");
  const [formData, setFormData] = useState({
    supplier_name: "",
    delivery_date: new Date().toISOString().split("T")[0],
    temperature: "",
    notes: "",
    items: [{ name: "", quantity: 1, unit: "kg" }] as DeliveryItem[],
  });

  useEffect(() => {
    fetchRecords();
  }, []);

  const fetchRecords = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;

    const { data } = await supabase
      .from("delivery_records")
      .select("*")
      .eq("user_id", session.user.id)
      .order("delivery_date", { ascending: false })
      .limit(50);

    setRecords(data || []);
    setLoading(false);
  };

  const handleItemChange = (index: number, field: keyof DeliveryItem, value: string | number) => {
    const newItems = [...formData.items];
    newItems[index] = { ...newItems[index], [field]: value };
    setFormData({ ...formData, items: newItems });
  };

  const addItem = () => {
    setFormData({
      ...formData,
      items: [...formData.items, { name: "", quantity: 1, unit: "kg" }],
    });
  };

  const removeItem = (index: number) => {
    if (formData.items.length === 1) return;
    setFormData({
      ...formData,
      items: formData.items.filter((_, i) => i !== index),
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;

    const validItems = formData.items.filter((item) => item.name.trim());
    if (validItems.length === 0) return;

    const { error } = await supabase.from("delivery_records").insert({
      user_id: session.user.id,
      restaurant_name: "My Restaurant",
      supplier_name: formData.supplier_name,
      delivery_date: formData.delivery_date,
      items: validItems,
      temperature: parseFloat(formData.temperature),
      is_accepted: true,
      rejection_reason: "",
      notes: formData.notes,
    });

    if (!error) {
      setShowForm(false);
      setFormData({
        supplier_name: "",
        delivery_date: new Date().toISOString().split("T")[0],
        temperature: "",
        notes: "",
        items: [{ name: "", quantity: 1, unit: "kg" }],
      });
      fetchRecords();
    }
  };

  const handleReject = async () => {
    const { error } = await supabase
      .from("delivery_records")
      .update({ is_accepted: false, rejection_reason: rejectionReason })
      .eq("id", rejectModal.id);

    if (!error) {
      setRejectModal({ id: "", open: false });
      setRejectionReason("");
      fetchRecords();
    }
  };

  const handleAccept = async (id: string) => {
    const { error } = await supabase
      .from("delivery_records")
      .update({ is_accepted: true, rejection_reason: "" })
      .eq("id", id);

    if (!error) fetchRecords();
  };

  const filteredRecords = records.filter((r) => {
    if (filter === "accepted") return r.is_accepted;
    if (filter === "rejected") return !r.is_accepted;
    return true;
  });

  const acceptedCount = records.filter((r) => r.is_accepted).length;
  const rejectedCount = records.filter((r) => !r.is_accepted).length;

  return (
    <div>
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Delivery & Stock Controls</h1>
          <p className="text-gray-600 mt-1">Track deliveries, temperatures, and acceptance status</p>
        </div>
        <button
          onClick={() => setShowForm(!showForm)}
          className="bg-green-600 text-white px-4 py-2 rounded-lg font-semibold hover:bg-green-700 transition-colors flex items-center gap-2"
        >
          <span>+</span> Log Delivery
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-8">
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <p className="text-sm text-gray-500">Total</p>
          <p className="text-2xl font-bold text-gray-900">{records.length}</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <p className="text-sm text-gray-500">Accepted</p>
          <p className="text-2xl font-bold text-green-600">{acceptedCount}</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <p className="text-sm text-gray-500">Rejected</p>
          <p className="text-2xl font-bold text-red-600">{rejectedCount}</p>
        </div>
      </div>

      {/* Filter Tabs */}
      <div className="flex gap-2 mb-6">
        {(["all", "accepted", "rejected"] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              filter === f
                ? "bg-green-600 text-white"
                : "bg-white text-gray-600 border border-gray-200 hover:bg-gray-50"
            }`}
          >
            {f.charAt(0).toUpperCase() + f.slice(1)}
          </button>
        ))}
      </div>

      {/* Add Form */}
      {showForm && (
        <div className="bg-white rounded-xl border border-gray-200 p-6 mb-8">
          <h2 className="text-lg font-semibold mb-4">Log New Delivery</h2>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Supplier Name</label>
                <input
                  type="text"
                  value={formData.supplier_name}
                  onChange={(e) => setFormData({ ...formData, supplier_name: e.target.value })}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500"
                  placeholder="e.g. Fresh Produce Ltd"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Delivery Date</label>
                <input
                  type="date"
                  value={formData.delivery_date}
                  onChange={(e) => setFormData({ ...formData, delivery_date: e.target.value })}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Temperature (°C)</label>
                <input
                  type="number"
                  step="0.1"
                  value={formData.temperature}
                  onChange={(e) => setFormData({ ...formData, temperature: e.target.value })}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500"
                  placeholder="e.g. 3.5"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
                <input
                  type="text"
                  value={formData.notes}
                  onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500"
                  placeholder="Optional notes"
                />
              </div>
            </div>

            {/* Items */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="block text-sm font-medium text-gray-700">Delivery Items</label>
                <button
                  type="button"
                  onClick={addItem}
                  className="text-sm text-green-600 hover:text-green-700 font-medium"
                >
                  + Add Item
                </button>
              </div>
              <div className="space-y-3">
                {formData.items.map((item, index) => (
                  <div key={index} className="flex gap-2 items-center">
                    <input
                      type="text"
                      value={item.name}
                      onChange={(e) => handleItemChange(index, "name", e.target.value)}
                      className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 text-sm"
                      placeholder="Item name"
                      required
                    />
                    <input
                      type="number"
                      min="0"
                      step="0.1"
                      value={item.quantity}
                      onChange={(e) => handleItemChange(index, "quantity", parseFloat(e.target.value) || 0)}
                      className="w-20 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 text-sm"
                    />
                    <select
                      value={item.unit}
                      onChange={(e) => handleItemChange(index, "unit", e.target.value)}
                      className="w-20 px-2 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 text-sm"
                    >
                      <option value="kg">kg</option>
                      <option value="g">g</option>
                      <option value="L">L</option>
                      <option value="ml">ml</option>
                      <option value="units">units</option>
                      <option value="cases">cases</option>
                    </select>
                    <button
                      type="button"
                      onClick={() => removeItem(index)}
                      className="text-red-500 hover:text-red-700 p-1"
                      disabled={formData.items.length === 1}
                    >
                      ✕
                    </button>
                  </div>
                ))}
              </div>
            </div>

            <div className="flex gap-3">
              <button
                type="submit"
                className="bg-green-600 text-white px-6 py-2 rounded-lg font-semibold hover:bg-green-700 transition-colors"
              >
                Save Delivery
              </button>
              <button
                type="button"
                onClick={() => setShowForm(false)}
                className="bg-gray-100 text-gray-700 px-6 py-2 rounded-lg font-semibold hover:bg-gray-200 transition-colors"
              >
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Rejection Modal */}
      {rejectModal.open && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl p-6 w-full max-w-md">
            <h3 className="text-lg font-semibold mb-4">Rejection Reason</h3>
            <textarea
              value={rejectionReason}
              onChange={(e) => setRejectionReason(e.target.value)}
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 mb-4"
              rows={3}
              placeholder="e.g. Temperature out of range, damaged packaging, expired date..."
            />
            <div className="flex gap-3">
              <button
                onClick={handleReject}
                className="bg-red-600 text-white px-6 py-2 rounded-lg font-semibold hover:bg-red-700 transition-colors"
              >
                Confirm Rejection
              </button>
              <button
                onClick={() => { setRejectModal({ id: "", open: false }); setRejectionReason(""); }}
                className="bg-gray-100 text-gray-700 px-6 py-2 rounded-lg font-semibold hover:bg-gray-200 transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Records List */}
      <div className="bg-white rounded-xl border border-gray-200">
        <div className="p-4 border-b border-gray-200">
          <h2 className="font-semibold text-gray-900">Delivery Records</h2>
        </div>

        {loading ? (
          <div className="p-8 text-center text-gray-500">Loading...</div>
        ) : filteredRecords.length === 0 ? (
          <div className="p-8 text-center text-gray-500">
            {filter === "all"
              ? "No delivery records yet. Tap \"Log Delivery\" to start."
              : `No ${filter} deliveries found.`}
          </div>
        ) : (
          <div className="divide-y divide-gray-200">
            {filteredRecords.map((record) => (
              <div key={record.id} className="p-4 hover:bg-gray-50">
                <div className="flex items-start justify-between mb-2">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <span
                        className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                          record.is_accepted
                            ? "bg-green-100 text-green-700"
                            : "bg-red-100 text-red-700"
                        }`}
                      >
                        {record.is_accepted ? "Accepted" : "Rejected"}
                      </span>
                      <span className="text-sm text-gray-500">
                        {record.temperature}°C
                      </span>
                    </div>
                    <p className="font-medium text-gray-900">{record.supplier_name}</p>
                    <p className="text-sm text-gray-600">
                      {new Date(record.delivery_date).toLocaleDateString()}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    {!record.is_accepted ? (
                      <button
                        onClick={() => handleAccept(record.id)}
                        className="text-sm px-3 py-1 rounded-lg bg-green-50 text-green-700 hover:bg-green-100 transition-colors"
                      >
                        Accept
                      </button>
                    ) : (
                      <button
                        onClick={() => setRejectModal({ id: record.id, open: true })}
                        className="text-sm px-3 py-1 rounded-lg bg-red-50 text-red-700 hover:bg-red-100 transition-colors"
                      >
                        Reject
                      </button>
                    )}
                  </div>
                </div>

                {/* Items list */}
                {record.items && record.items.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-2">
                    {record.items.map((item: DeliveryItem, idx: number) => (
                      <span
                        key={idx}
                        className="px-2 py-1 bg-gray-100 text-gray-700 rounded text-xs"
                      >
                        {item.name} {item.quantity} {item.unit}
                      </span>
                    ))}
                  </div>
                )}

                {/* Rejection reason */}
                {!record.is_accepted && record.rejection_reason && (
                  <div className="mt-2 p-2 bg-red-50 rounded-lg">
                    <p className="text-sm text-red-700">
                      <span className="font-medium">Reason: </span>
                      {record.rejection_reason}
                    </p>
                  </div>
                )}

                {record.notes && (
                  <p className="text-sm text-gray-500 mt-2">{record.notes}</p>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
