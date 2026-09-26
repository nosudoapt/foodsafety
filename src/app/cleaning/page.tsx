"use client";

import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";

const defaultTasks: Record<string, string[]> = {
  daily: [
    "Kitchen counters",
    "Cooking equipment",
    "Floor mopping",
    "Bin sanitisation",
    "Handwash stations",
  ],
  weekly: [
    "Deep clean ovens",
    "Clean fridge/freezer interiors",
    "Descale kettles",
    "Clean extraction filters",
  ],
  monthly: [
    "Deep clean storage areas",
    "Clean walls and ceilings",
    "Service fire extinguishers",
    "Pest control inspection",
  ],
};

const frequencyColors: Record<string, string> = {
  daily: "bg-orange-100 text-orange-700",
  weekly: "bg-blue-100 text-blue-700",
  monthly: "bg-purple-100 text-purple-700",
};

const frequencyIcons: Record<string, string> = {
  daily: "📅",
  weekly: "📆",
  monthly: "🗓️",
};

export default function CleaningPage() {
  const [records, setRecords] = useState<any[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<"tasks" | "history">("tasks");
  const [formData, setFormData] = useState({
    task_name: "",
    area: "",
    frequency: "daily" as "daily" | "weekly" | "monthly",
    notes: "",
  });

  useEffect(() => {
    fetchRecords();
  }, []);

  const fetchRecords = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;

    const { data } = await supabase
      .from("cleaning_records")
      .select("*")
      .eq("user_id", session.user.id)
      .order("created_at", { ascending: false })
      .limit(100);

    setRecords(data || []);
    setLoading(false);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;

    const { error } = await supabase.from("cleaning_records").insert({
      user_id: session.user.id,
      restaurant_name: "My Restaurant",
      task_name: formData.task_name,
      area: formData.area,
      frequency: formData.frequency,
      completed: false,
      notes: formData.notes,
    });

    if (!error) {
      setShowForm(false);
      setFormData({ task_name: "", area: "", frequency: "daily", notes: "" });
      fetchRecords();
    }
  };

  const markComplete = async (id: string) => {
    const { error } = await supabase
      .from("cleaning_records")
      .update({
        completed: true,
        completed_at: new Date().toISOString(),
      })
      .eq("id", id);

    if (!error) {
      fetchRecords();
    }
  };

  const unmarkComplete = async (id: string) => {
    const { error } = await supabase
      .from("cleaning_records")
      .update({
        completed: false,
        completed_at: null,
      })
      .eq("id", id);

    if (!error) {
      fetchRecords();
    }
  };

  const deleteRecord = async (id: string) => {
    const { error } = await supabase
      .from("cleaning_records")
      .delete()
      .eq("id", id);

    if (!error) {
      fetchRecords();
    }
  };

  const addDefaultTask = (taskName: string, frequency: string) => {
    setFormData({
      ...formData,
      task_name: taskName,
      frequency: frequency as "daily" | "weekly" | "monthly",
    });
    setShowForm(true);
  };

  const getTaskStatus = (taskName: string, frequency: string) => {
    const today = new Date().toISOString().split("T")[0];
    const recentRecord = records.find(
      (r) =>
        r.task_name === taskName &&
        r.frequency === frequency &&
        r.completed &&
        r.completed_at?.startsWith(today)
    );
    return recentRecord ? "completed" : "pending";
  };

  const incompleteRecords = records.filter((r) => !r.completed);
  const completedRecords = records.filter((r) => r.completed);

  return (
    <div>
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Cleaning & Hygiene</h1>
          <p className="text-gray-600 mt-1">Track and manage cleaning tasks</p>
        </div>
        <button
          onClick={() => setShowForm(!showForm)}
          className="bg-green-600 text-white px-4 py-2 rounded-lg font-semibold hover:bg-green-700 transition-colors flex items-center gap-2"
        >
          <span>+</span> Add Task
        </button>
      </div>

      {/* Tab Navigation */}
      <div className="flex gap-1 mb-6 bg-gray-100 p-1 rounded-lg">
        <button
          onClick={() => setActiveTab("tasks")}
          className={`flex-1 py-2 px-4 rounded-md font-medium transition-colors ${
            activeTab === "tasks"
              ? "bg-white text-green-700 shadow-sm"
              : "text-gray-600 hover:text-gray-900"
          }`}
        >
          Cleaning Tasks
        </button>
        <button
          onClick={() => setActiveTab("history")}
          className={`flex-1 py-2 px-4 rounded-md font-medium transition-colors ${
            activeTab === "history"
              ? "bg-white text-green-700 shadow-sm"
              : "text-gray-600 hover:text-gray-900"
          }`}
        >
          Completion History
        </button>
      </div>

      {/* Add Task Form */}
      {showForm && (
        <div className="bg-white rounded-xl border border-gray-200 p-6 mb-8">
          <h2 className="text-lg font-semibold mb-4">Add Cleaning Task</h2>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Task Name
                </label>
                <input
                  type="text"
                  value={formData.task_name}
                  onChange={(e) =>
                    setFormData({ ...formData, task_name: e.target.value })
                  }
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500"
                  placeholder="e.g. Kitchen counters, Floor mopping"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Area
                </label>
                <input
                  type="text"
                  value={formData.area}
                  onChange={(e) =>
                    setFormData({ ...formData, area: e.target.value })
                  }
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500"
                  placeholder="e.g. Kitchen, Dining area, Storage"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Frequency
                </label>
                <select
                  value={formData.frequency}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      frequency: e.target.value as "daily" | "weekly" | "monthly",
                    })
                  }
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500"
                >
                  <option value="daily">Daily</option>
                  <option value="weekly">Weekly</option>
                  <option value="monthly">Monthly</option>
                </select>
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
                Add Task
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

      {/* Tasks View */}
      {activeTab === "tasks" && (
        <>
          {/* Quick Add Default Tasks */}
          <div className="mb-8">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">
              Common Cleaning Tasks
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {Object.entries(defaultTasks).map(([frequency, tasks]) => (
                <div key={frequency} className="bg-white rounded-xl border border-gray-200 p-4">
                  <div className="flex items-center gap-2 mb-3">
                    <span>{frequencyIcons[frequency]}</span>
                    <span
                      className={`px-2 py-0.5 rounded-full text-xs font-medium ${frequencyColors[frequency]}`}
                    >
                      {frequency.charAt(0).toUpperCase() + frequency.slice(1)}
                    </span>
                  </div>
                  <ul className="space-y-2">
                    {tasks.map((task) => {
                      const status = getTaskStatus(task, frequency);
                      return (
                        <li key={task} className="flex items-center gap-2">
                          <button
                            onClick={() => addDefaultTask(task, frequency)}
                            className={`flex-1 text-left text-sm py-1 px-2 rounded transition-colors ${
                              status === "completed"
                                ? "bg-green-50 text-green-700"
                                : "text-gray-700 hover:bg-gray-50"
                            }`}
                          >
                            {task}
                          </button>
                          <span
                            className={`text-xs ${
                              status === "completed"
                                ? "text-green-600"
                                : "text-gray-400"
                            }`}
                          >
                            {status === "completed" ? "✓" : "+ Add"}
                          </span>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              ))}
            </div>
          </div>

          {/* Pending Tasks */}
          <div className="bg-white rounded-xl border border-gray-200 mb-8">
            <div className="p-4 border-b border-gray-200">
              <h2 className="font-semibold text-gray-900">
                Pending Tasks ({incompleteRecords.length})
              </h2>
            </div>

            {loading ? (
              <div className="p-8 text-center text-gray-500">Loading...</div>
            ) : incompleteRecords.length === 0 ? (
              <div className="p-8 text-center text-gray-500">
                All cleaning tasks completed! 🎉
              </div>
            ) : (
              <div className="divide-y divide-gray-200">
                {incompleteRecords.map((record) => (
                  <div key={record.id} className="p-4 hover:bg-gray-50">
                    <div className="flex items-center justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <span
                            className={`px-2 py-0.5 rounded-full text-xs font-medium ${frequencyColors[record.frequency]}`}
                          >
                            {record.frequency}
                          </span>
                        </div>
                        <p className="font-medium text-gray-900">
                          {record.task_name}
                        </p>
                        <p className="text-sm text-gray-600">{record.area}</p>
                        {record.notes && (
                          <p className="text-sm text-gray-500 mt-1">
                            {record.notes}
                          </p>
                        )}
                      </div>
                      <button
                        onClick={() => markComplete(record.id)}
                        className="ml-4 bg-green-100 text-green-700 px-4 py-2 rounded-lg font-medium hover:bg-green-200 transition-colors flex items-center gap-2"
                      >
                        <span>✓</span> Complete
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}

      {/* History View */}
      {activeTab === "history" && (
        <div className="bg-white rounded-xl border border-gray-200">
          <div className="p-4 border-b border-gray-200">
            <h2 className="font-semibold text-gray-900">
              Completion History ({completedRecords.length})
            </h2>
          </div>

          {loading ? (
            <div className="p-8 text-center text-gray-500">Loading...</div>
          ) : completedRecords.length === 0 ? (
            <div className="p-8 text-center text-gray-500">
              No completed tasks yet. Complete a task to see it here.
            </div>
          ) : (
            <div className="divide-y divide-gray-200">
              {completedRecords.map((record) => (
                <div key={record.id} className="p-4 hover:bg-gray-50">
                  <div className="flex items-center justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <span
                          className={`px-2 py-0.5 rounded-full text-xs font-medium ${frequencyColors[record.frequency]}`}
                        >
                          {record.frequency}
                        </span>
                        <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-700">
                          ✓ Completed
                        </span>
                      </div>
                      <p className="font-medium text-gray-900">
                        {record.task_name}
                      </p>
                      <p className="text-sm text-gray-600">{record.area}</p>
                      {record.notes && (
                        <p className="text-sm text-gray-500 mt-1">
                          {record.notes}
                        </p>
                      )}
                    </div>
                    <div className="text-right flex flex-col items-end gap-2">
                      <p className="text-sm text-gray-600">
                        {record.completed_at
                          ? new Date(record.completed_at).toLocaleString()
                          : "Completed"}
                      </p>
                      <div className="flex gap-2">
                        <button
                          onClick={() => unmarkComplete(record.id)}
                          className="text-xs text-orange-600 hover:text-orange-800 font-medium"
                        >
                          Undo
                        </button>
                        <button
                          onClick={() => deleteRecord(record.id)}
                          className="text-xs text-red-600 hover:text-red-800 font-medium"
                        >
                          Delete
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
