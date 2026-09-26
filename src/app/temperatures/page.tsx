"use client";

import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";

const recordTypes = [
  { value: "cooking", label: "Cooking", minTemp: 74, maxTemp: 100 },
  { value: "cooling", label: "Cooling", minTemp: 0, maxTemp: 21 },
  { value: "cold_storage", label: "Cold Storage", minTemp: 0, maxTemp: 4 },
  { value: "hot_holding", label: "Hot Holding", minTemp: 60, maxTemp: 85 },
  { value: "reheating", label: "Reheating", minTemp: 74, maxTemp: 100 },
  { value: "probe_calibration", label: "Probe Calibration", minTemp: 0, maxTemp: 100 },
];

const commonFoodItems: Record<string, string[]> = {
  cooking: ["Poultry (whole)", "Poultry (pieces)", "Ground meat", "Pork", "Fish", "Egg dishes", "Leftovers", "Beef (medium-rare)", "Beef (medium)", "Beef (well done)"],
  cooling: ["Soups", "Stews", "Rice", "Sauces", "Dairy dishes", "Meat dishes"],
  cold_storage: ["Fridge - Raw meat", "Fridge - Dairy", "Fridge - Vegetables", "Freezer - General"],
  hot_holding: ["Hot food display", "Soup station", "Steam table", "Bain-marie"],
  reheating: ["Leftovers", "Pre-cooked meats", "Soups", "Rice"],
  probe_calibration: ["Ice water test", "Boiling water test"],
};

export default function TemperaturesPage() {
  const [records, setRecords] = useState<any[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [loading, setLoading] = useState(true);
  const [formData, setFormData] = useState({
    record_type: "cold_storage",
    equipment_name: "",
    food_item: "",
    temperature: "",
    notes: "",
  });

  useEffect(() => {
    fetchRecords();
  }, []);

  const fetchRecords = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;

    const { data } = await supabase
      .from("temperature_records")
      .select("*")
      .eq("user_id", session.user.id)
      .order("recorded_at", { ascending: false })
      .limit(50);

    setRecords(data || []);
    setLoading(false);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;

    const recordType = recordTypes.find((r) => r.value === formData.record_type);
    const temp = parseFloat(formData.temperature);
    const isSafe = temp >= (recordType?.minTemp || 0) && temp <= (recordType?.maxTemp || 100);

    const { error } = await supabase.from("temperature_records").insert({
      user_id: session.user.id,
      restaurant_name: "My Restaurant",
      equipment_name: formData.equipment_name,
      record_type: formData.record_type as any,
      food_item: formData.food_item,
      temperature: temp,
      min_safe_temp: recordType?.minTemp || 0,
      max_safe_temp: recordType?.maxTemp || 100,
      is_safe: isSafe,
      notes: formData.notes,
    });

    if (!error) {
      setShowForm(false);
      setFormData({ record_type: "cold_storage", equipment_name: "", food_item: "", temperature: "", notes: "" });
      fetchRecords();
    }
  };

  const getRecordTypeColor = (type: string) => {
    const colors: Record<string, string> = {
      cooking: "bg-red-100 text-red-700",
      cooling: "bg-blue-100 text-blue-700",
      cold_storage: "bg-cyan-100 text-cyan-700",
      hot_holding: "bg-orange-100 text-orange-700",
      reheating: "bg-yellow-100 text-yellow-700",
      probe_calibration: "bg-purple-100 text-purple-700",
    };
    return colors[type] || "bg-gray-100 text-gray-700";
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Temperature Monitoring</h1>
          <p className="text-gray-600 mt-1">Record and track food temperatures</p>
        </div>
        <button
          onClick={() => setShowForm(!showForm)}
          className="bg-green-600 text-white px-4 py-2 rounded-lg font-semibold hover:bg-green-700 transition-colors flex items-center gap-2"
        >
          <span>+</span> Add Record
        </button>
      </div>

      {/* Add Record Form */}
      {showForm && (
        <div className="bg-white rounded-xl border border-gray-200 p-6 mb-8">
          <h2 className="text-lg font-semibold mb-4">New Temperature Record</h2>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Record Type</label>
                <select
                  value={formData.record_type}
                  onChange={(e) => setFormData({ ...formData, record_type: e.target.value, food_item: "" })}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500"
                >
                  {recordTypes.map((type) => (
                    <option key={type.value} value={type.value}>
                      {type.label}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Equipment</label>
                <input
                  type="text"
                  value={formData.equipment_name}
                  onChange={(e) => setFormData({ ...formData, equipment_name: e.target.value })}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500"
                  placeholder="e.g. Fridge 1, Oven, Hot holding unit"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Food Item</label>
                <select
                  value={formData.food_item}
                  onChange={(e) => setFormData({ ...formData, food_item: e.target.value })}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500"
                  required
                >
                  <option value="">Select food item</option>
                  {commonFoodItems[formData.record_type]?.map((item) => (
                    <option key={item} value={item}>
                      {item}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Temperature (°C)</label>
                <input
                  type="number"
                  step="0.1"
                  value={formData.temperature}
                  onChange={(e) => setFormData({ ...formData, temperature: e.target.value })}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500"
                  placeholder="e.g. 4.5"
                  required
                />
                {formData.temperature && (
                  <p className={`text-sm mt-1 ${parseFloat(formData.temperature) >= (recordTypes.find(r => r.value === formData.record_type)?.minTemp || 0) && parseFloat(formData.temperature) <= (recordTypes.find(r => r.value === formData.record_type)?.maxTemp || 100) ? "text-green-600" : "text-red-600"}`}>
                    {parseFloat(formData.temperature) >= (recordTypes.find(r => r.value === formData.record_type)?.minTemp || 0) && parseFloat(formData.temperature) <= (recordTypes.find(r => r.value === formData.record_type)?.maxTemp || 100) ? "✓ Safe temperature" : "✗ Out of safe range"}
                  </p>
                )}
              </div>

              <div className="md:col-span-2">
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
          <h2 className="font-semibold text-gray-900">Recent Records</h2>
        </div>

        {loading ? (
          <div className="p-8 text-center text-gray-500">Loading...</div>
        ) : records.length === 0 ? (
          <div className="p-8 text-center text-gray-500">
            No temperature records yet. Tap &quot;Add Record&quot; to start.
          </div>
        ) : (
          <div className="divide-y divide-gray-200">
            {records.map((record) => (
              <div key={record.id} className="p-4 hover:bg-gray-50">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${getRecordTypeColor(record.record_type)}`}>
                        {record.record_type.replace("_", " ")}
                      </span>
                      {!record.is_safe && (
                        <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-700">
                          ⚠ Out of Range
                        </span>
                      )}
                    </div>
                    <p className="font-medium text-gray-900">{record.food_item}</p>
                    <p className="text-sm text-gray-600">{record.equipment_name}</p>
                    {record.notes && (
                      <p className="text-sm text-gray-500 mt-1">{record.notes}</p>
                    )}
                  </div>
                  <div className="text-right">
                    <p className={`text-2xl font-bold ${record.is_safe ? "text-green-600" : "text-red-600"}`}>
                      {record.temperature}°C
                    </p>
                    <p className="text-xs text-gray-500">
                      {new Date(record.recorded_at).toLocaleString()}
                    </p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
