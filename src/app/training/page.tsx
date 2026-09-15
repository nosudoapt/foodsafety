"use client";

import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";

const trainingTopics = [
  "Food Handler Certification",
  "HACCP Training",
  "Allergen Awareness",
  "WHMIS (Workplace Hazardous Materials)",
  "First Aid",
  "Fire Safety",
  "Occupational Health & Safety",
  "Sanitation & Hygiene",
  "Customer Service",
  "Alcohol Service (Smart Serve)",
];

const topicColors: Record<string, string> = {
  "Food Handler Certification": "bg-green-100 text-green-700",
  "HACCP Training": "bg-blue-100 text-blue-700",
  "Allergen Awareness": "bg-yellow-100 text-yellow-700",
  "WHMIS (Workplace Hazardous Materials)": "bg-red-100 text-red-700",
  "First Aid": "bg-pink-100 text-pink-700",
  "Fire Safety": "bg-orange-100 text-orange-700",
  "Occupational Health & Safety": "bg-purple-100 text-purple-700",
  "Sanitation & Hygiene": "bg-cyan-100 text-cyan-700",
  "Customer Service": "bg-indigo-100 text-indigo-700",
  "Alcohol Service (Smart Serve)": "bg-teal-100 text-teal-700",
};

export default function TrainingPage() {
  const [records, setRecords] = useState<any[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<"all" | "expiring">("all");
  const [formData, setFormData] = useState({
    staff_name: "",
    training_topic: "Food Handler Certification",
    training_date: "",
    expiry_date: "",
    certificate_url: "",
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
      .from("training_records")
      .select("*")
      .eq("user_id", session.user.id)
      .order("expiry_date", { ascending: true });

    setRecords(data || []);
    setLoading(false);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (!session) return;

    const { error } = await supabase.from("training_records").insert({
      user_id: session.user.id,
      restaurant_name: "My Restaurant",
      staff_name: formData.staff_name,
      training_topic: formData.training_topic,
      training_date: formData.training_date,
      expiry_date: formData.expiry_date || null,
      certificate_url: formData.certificate_url,
      notes: formData.notes,
    });

    if (!error) {
      setShowForm(false);
      setFormData({
        staff_name: "",
        training_topic: "Food Handler Certification",
        training_date: "",
        expiry_date: "",
        certificate_url: "",
        notes: "",
      });
      fetchRecords();
    }
  };

  const deleteRecord = async (id: string) => {
    const { error } = await supabase
      .from("training_records")
      .delete()
      .eq("id", id);

    if (!error) {
      fetchRecords();
    }
  };

  const getDaysUntilExpiry = (expiryDate: string) => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const expiry = new Date(expiryDate);
    expiry.setHours(0, 0, 0, 0);
    const diffTime = expiry.getTime() - today.getTime();
    return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  };

  const getExpiryStatus = (expiryDate: string | null) => {
    if (!expiryDate) return null;
    const days = getDaysUntilExpiry(expiryDate);
    if (days < 0)
      return { label: "Expired", color: "bg-red-100 text-red-700", days };
    if (days <= 30)
      return {
        label: `${days}d left`,
        color: "bg-orange-100 text-orange-700",
        days,
      };
    if (days <= 90)
      return {
        label: `${days}d left`,
        color: "bg-yellow-100 text-yellow-700",
        days,
      };
    return {
      label: `${days}d left`,
      color: "bg-green-100 text-green-700",
      days,
    };
  };

  const expiringRecords = records.filter((r) => {
    if (!r.expiry_date) return false;
    const days = getDaysUntilExpiry(r.expiry_date);
    return days <= 90;
  });

  const displayRecords = activeTab === "expiring" ? expiringRecords : records;

  return (
    <div>
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">
            Training Records
          </h1>
          <p className="text-gray-600 mt-1">
            Track staff certifications and training
          </p>
        </div>
        <button
          onClick={() => setShowForm(!showForm)}
          className="bg-green-600 text-white px-4 py-2 rounded-lg font-semibold hover:bg-green-700 transition-colors flex items-center gap-2"
        >
          <span>+</span> Add Record
        </button>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <p className="text-sm text-gray-600">Total Records</p>
          <p className="text-2xl font-bold text-gray-900">{records.length}</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <p className="text-sm text-gray-600">Staff Members</p>
          <p className="text-2xl font-bold text-gray-900">
            {new Set(records.map((r) => r.staff_name)).size}
          </p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <p className="text-sm text-gray-600">Expiring Soon</p>
          <p className="text-2xl font-bold text-orange-600">
            {expiringRecords.length}
          </p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <p className="text-sm text-gray-600">Expired</p>
          <p className="text-2xl font-bold text-red-600">
            {records.filter((r) => {
              if (!r.expiry_date) return false;
              return getDaysUntilExpiry(r.expiry_date) < 0;
            }).length}
          </p>
        </div>
      </div>

      {/* Tab Navigation */}
      <div className="flex gap-1 mb-6 bg-gray-100 p-1 rounded-lg">
        <button
          onClick={() => setActiveTab("all")}
          className={`flex-1 py-2 px-4 rounded-md font-medium transition-colors ${
            activeTab === "all"
              ? "bg-white text-green-700 shadow-sm"
              : "text-gray-600 hover:text-gray-900"
          }`}
        >
          All Records ({records.length})
        </button>
        <button
          onClick={() => setActiveTab("expiring")}
          className={`flex-1 py-2 px-4 rounded-md font-medium transition-colors ${
            activeTab === "expiring"
              ? "bg-white text-orange-700 shadow-sm"
              : "text-gray-600 hover:text-gray-900"
          }`}
        >
          Expiring Soon ({expiringRecords.length})
        </button>
      </div>

      {/* Add Record Form */}
      {showForm && (
        <div className="bg-white rounded-xl border border-gray-200 p-6 mb-8">
          <h2 className="text-lg font-semibold mb-4">New Training Record</h2>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Staff Name
                </label>
                <input
                  type="text"
                  value={formData.staff_name}
                  onChange={(e) =>
                    setFormData({ ...formData, staff_name: e.target.value })
                  }
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500"
                  placeholder="e.g. John Smith"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Training Topic
                </label>
                <select
                  value={formData.training_topic}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      training_topic: e.target.value,
                    })
                  }
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500"
                >
                  {trainingTopics.map((topic) => (
                    <option key={topic} value={topic}>
                      {topic}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Training Date
                </label>
                <input
                  type="date"
                  value={formData.training_date}
                  onChange={(e) =>
                    setFormData({ ...formData, training_date: e.target.value })
                  }
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Expiry Date (Optional)
                </label>
                <input
                  type="date"
                  value={formData.expiry_date}
                  onChange={(e) =>
                    setFormData({ ...formData, expiry_date: e.target.value })
                  }
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Certificate URL (Optional)
                </label>
                <input
                  type="url"
                  value={formData.certificate_url}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      certificate_url: e.target.value,
                    })
                  }
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500"
                  placeholder="https://..."
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Notes (Optional)
                </label>
                <input
                  type="text"
                  value={formData.notes}
                  onChange={(e) =>
                    setFormData({ ...formData, notes: e.target.value })
                  }
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500"
                  placeholder="Any additional notes"
                />
              </div>
            </div>

            <div className="flex gap-3">
              <button
                type="submit"
                className="bg-green-600 text-white px-6 py-2 rounded-lg font-semibold hover:bg-green-700 transition-colors"
              >
                Save Record
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

      {/* Records List */}
      <div className="bg-white rounded-xl border border-gray-200">
        <div className="p-4 border-b border-gray-200">
          <h2 className="font-semibold text-gray-900">
            {activeTab === "expiring" ? "Expiring Records" : "All Records"}
          </h2>
        </div>

        {loading ? (
          <div className="p-8 text-center text-gray-500">Loading...</div>
        ) : displayRecords.length === 0 ? (
          <div className="p-8 text-center text-gray-500">
            {activeTab === "expiring"
              ? "No records expiring soon. Great job!"
              : 'No training records yet. Tap "Add Record" to start.'}
          </div>
        ) : (
          <div className="divide-y divide-gray-200">
            {displayRecords.map((record) => {
              const expiryStatus = getExpiryStatus(record.expiry_date);
              return (
                <div key={record.id} className="p-4 hover:bg-gray-50">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1 flex-wrap">
                        <span
                          className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                            topicColors[record.training_topic] ||
                            "bg-gray-100 text-gray-700"
                          }`}
                        >
                          {record.training_topic}
                        </span>
                        {expiryStatus && (
                          <span
                            className={`px-2 py-0.5 rounded-full text-xs font-medium ${expiryStatus.color}`}
                          >
                            {expiryStatus.label}
                          </span>
                        )}
                      </div>
                      <p className="font-medium text-gray-900">
                        {record.staff_name}
                      </p>
                      <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-gray-600 mt-1">
                        <span>
                          Trained:{" "}
                          {new Date(
                            record.training_date
                          ).toLocaleDateString()}
                        </span>
                        {record.expiry_date && (
                          <span>
                            Expires:{" "}
                            {new Date(
                              record.expiry_date
                            ).toLocaleDateString()}
                          </span>
                        )}
                      </div>
                      {record.notes && (
                        <p className="text-sm text-gray-500 mt-1">
                          {record.notes}
                        </p>
                      )}
                      {record.certificate_url && (
                        <a
                          href={record.certificate_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-sm text-blue-600 hover:underline mt-1 inline-block"
                        >
                          View Certificate
                        </a>
                      )}
                    </div>
                    <button
                      onClick={() => deleteRecord(record.id)}
                      className="ml-4 text-red-600 hover:text-red-800 text-sm font-medium"
                    >
                      Delete
                    </button>
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
