"use client";

import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";

interface PestControlRecord {
  id: string;
  user_id: string;
  restaurant_name: string;
  inspection_date: string;
  findings: string;
  action_taken: string;
  next_inspection_date: string;
  notes: string;
  created_at: string;
}

export default function PestControlPage() {
  const [records, setRecords] = useState<PestControlRecord[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formData, setFormData] = useState({
    restaurant_name: "",
    inspection_date: "",
    findings: "",
    action_taken: "",
    next_inspection_date: "",
    notes: "",
  });

  useEffect(() => {
    fetchRecords();
  }, []);

  const fetchRecords = async () => {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (!session) return;

    const { data } = await supabase
      .from("pest_control")
      .select("*")
      .eq("user_id", session.user.id)
      .order("inspection_date", { ascending: false })
      .limit(100);

    setRecords(data || []);
    setLoading(false);
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
      inspection_date: formData.inspection_date,
      findings: formData.findings,
      action_taken: formData.action_taken,
      next_inspection_date: formData.next_inspection_date || null,
      notes: formData.notes,
    };

    if (editingId) {
      const { error } = await supabase
        .from("pest_control")
        .update(payload)
        .eq("id", editingId);

      if (!error) {
        resetForm();
        fetchRecords();
      }
    } else {
      const { error } = await supabase.from("pest_control").insert(payload);

      if (!error) {
        resetForm();
        fetchRecords();
      }
    }
  };

  const handleEdit = (record: PestControlRecord) => {
    setEditingId(record.id);
    setFormData({
      restaurant_name: record.restaurant_name,
      inspection_date: record.inspection_date,
      findings: record.findings,
      action_taken: record.action_taken,
      next_inspection_date: record.next_inspection_date,
      notes: record.notes,
    });
    setShowForm(true);
  };

  const handleDelete = async (id: string) => {
    const { error } = await supabase.from("pest_control").delete().eq("id", id);
    if (!error) {
      fetchRecords();
    }
  };

  const resetForm = () => {
    setFormData({
      restaurant_name: "",
      inspection_date: "",
      findings: "",
      action_taken: "",
      next_inspection_date: "",
      notes: "",
    });
    setEditingId(null);
    setShowForm(false);
  };

  const getNextInspectionInfo = (date: string) => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const nextDate = new Date(date + "T00:00:00");
    const diffMs = nextDate.getTime() - today.getTime();
    const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));

    if (diffDays < 0) {
      return {
        label: `${Math.abs(diffDays)} day(s) overdue`,
        color: "bg-red-100 text-red-700",
        urgent: true,
      };
    }
    if (diffDays === 0) {
      return { label: "Due today", color: "bg-orange-100 text-orange-700", urgent: true };
    }
    if (diffDays <= 7) {
      return {
        label: `In ${diffDays} day(s)`,
        color: "bg-yellow-100 text-yellow-700",
        urgent: false,
      };
    }
    return {
      label: `In ${diffDays} days`,
      color: "bg-green-100 text-green-700",
      urgent: false,
    };
  };

  const upcomingInspections = records
    .filter((r) => r.next_inspection_date)
    .sort(
      (a, b) =>
        new Date(a.next_inspection_date).getTime() -
        new Date(b.next_inspection_date).getTime()
    )
    .slice(0, 3);

  return (
    <div>
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Pest Control</h1>
          <p className="text-gray-600 mt-1">
            Track inspections and manage pest prevention
          </p>
        </div>
        <button
          onClick={() => {
            resetForm();
            setShowForm(!showForm);
          }}
          className="bg-green-600 text-white px-4 py-2 rounded-lg font-semibold hover:bg-green-700 transition-colors flex items-center gap-2"
        >
          <span>+</span> Add Record
        </button>
      </div>

      {/* Next Inspection Banner */}
      {upcomingInspections.length > 0 && (
        <div className="mb-8 bg-white rounded-xl border border-gray-200 p-4">
          <h2 className="font-semibold text-gray-900 mb-3">Upcoming Inspections</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {upcomingInspections.map((record) => {
              const info = getNextInspectionInfo(record.next_inspection_date);
              return (
                <div
                  key={record.id}
                  className={`rounded-lg p-3 ${info.color}`}
                >
                  <p className="font-medium text-sm">{record.restaurant_name}</p>
                  <p className="text-xs mt-1">
                    {new Date(record.next_inspection_date).toLocaleDateString()}
                  </p>
                  <p className="text-xs font-semibold mt-1">{info.label}</p>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Add / Edit Form */}
      {showForm && (
        <div className="bg-white rounded-xl border border-gray-200 p-6 mb-8">
          <h2 className="text-lg font-semibold mb-4">
            {editingId ? "Edit Inspection Record" : "New Inspection Record"}
          </h2>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Restaurant Name
                </label>
                <input
                  type="text"
                  value={formData.restaurant_name}
                  onChange={(e) =>
                    setFormData({ ...formData, restaurant_name: e.target.value })
                  }
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500"
                  placeholder="e.g. Main Street Cafe"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Inspection Date
                </label>
                <input
                  type="date"
                  value={formData.inspection_date}
                  onChange={(e) =>
                    setFormData({ ...formData, inspection_date: e.target.value })
                  }
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500"
                  required
                />
              </div>

              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Findings
                </label>
                <textarea
                  value={formData.findings}
                  onChange={(e) =>
                    setFormData({ ...formData, findings: e.target.value })
                  }
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500"
                  placeholder="Describe any pest activity or evidence found"
                  rows={3}
                  required
                />
              </div>

              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Action Taken
                </label>
                <textarea
                  value={formData.action_taken}
                  onChange={(e) =>
                    setFormData({ ...formData, action_taken: e.target.value })
                  }
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500"
                  placeholder="Describe actions taken to address findings"
                  rows={2}
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Next Inspection Date
                </label>
                <input
                  type="date"
                  value={formData.next_inspection_date}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      next_inspection_date: e.target.value,
                    })
                  }
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Notes
                </label>
                <input
                  type="text"
                  value={formData.notes}
                  onChange={(e) =>
                    setFormData({ ...formData, notes: e.target.value })
                  }
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500"
                  placeholder="Optional notes"
                />
              </div>
            </div>

            <div className="flex gap-3">
              <button
                type="submit"
                className="bg-green-600 text-white px-6 py-2 rounded-lg font-semibold hover:bg-green-700 transition-colors"
              >
                {editingId ? "Update Record" : "Save Record"}
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

      {/* Records List */}
      <div className="bg-white rounded-xl border border-gray-200">
        <div className="p-4 border-b border-gray-200">
          <h2 className="font-semibold text-gray-900">
            Inspection Records ({records.length})
          </h2>
        </div>

        {loading ? (
          <div className="p-8 text-center text-gray-500">Loading...</div>
        ) : records.length === 0 ? (
          <div className="p-8 text-center text-gray-500">
            No inspection records yet. Tap &quot;Add Record&quot; to start tracking.
          </div>
        ) : (
          <div className="divide-y divide-gray-200">
            {records.map((record) => {
              const nextInfo = record.next_inspection_date
                ? getNextInspectionInfo(record.next_inspection_date)
                : null;
              return (
                <div key={record.id} className="p-4 hover:bg-gray-50">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1 flex-wrap">
                        <span className="font-medium text-gray-900">
                          {record.restaurant_name}
                        </span>
                        {nextInfo && (
                          <span
                            className={`px-2 py-0.5 rounded-full text-xs font-medium ${nextInfo.color}`}
                          >
                            {nextInfo.label}
                          </span>
                        )}
                      </div>

                      <div className="text-sm text-gray-600 mb-1">
                        <span className="font-medium">Inspected:</span>{" "}
                        {new Date(record.inspection_date).toLocaleDateString()}
                        {record.next_inspection_date && (
                          <>
                            {" "}
                            &middot;{" "}
                            <span className="font-medium">Next:</span>{" "}
                            {new Date(
                              record.next_inspection_date
                            ).toLocaleDateString()}
                          </>
                        )}
                      </div>

                      <p className="text-sm text-gray-700 mt-1">
                        <span className="font-medium">Findings:</span>{" "}
                        {record.findings}
                      </p>
                      <p className="text-sm text-gray-700 mt-1">
                        <span className="font-medium">Action:</span>{" "}
                        {record.action_taken}
                      </p>
                      {record.notes && (
                        <p className="text-sm text-gray-500 mt-1">
                          {record.notes}
                        </p>
                      )}
                    </div>

                    <div className="flex gap-2 shrink-0">
                      <button
                        onClick={() => handleEdit(record)}
                        className="text-sm text-blue-600 hover:text-blue-800 font-medium"
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => handleDelete(record.id)}
                        className="text-sm text-red-600 hover:text-red-800 font-medium"
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
