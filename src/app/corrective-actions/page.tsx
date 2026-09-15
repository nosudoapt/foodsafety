"use client";

import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";

const severityConfig = {
  low: { label: "Low", color: "bg-blue-100 text-blue-700", icon: "ℹ" },
  medium: { label: "Medium", color: "bg-yellow-100 text-yellow-700", icon: "⚠" },
  high: { label: "High", color: "bg-orange-100 text-orange-700", icon: "🔥" },
  critical: { label: "Critical", color: "bg-red-100 text-red-700", icon: "🚨" },
};

export default function CorrectiveActionsPage() {
  const [actions, setActions] = useState<any[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"all" | "open" | "resolved">("all");
  const [formData, setFormData] = useState({
    restaurant_name: "",
    issue_description: "",
    severity: "medium",
    action_taken: "",
    notes: "",
  });

  useEffect(() => {
    fetchActions();
  }, []);

  const fetchActions = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;

    const { data } = await supabase
      .from("corrective_actions")
      .select("*")
      .eq("user_id", session.user.id)
      .order("created_at", { ascending: false })
      .limit(100);

    setActions(data || []);
    setLoading(false);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;

    const { error } = await supabase.from("corrective_actions").insert({
      user_id: session.user.id,
      restaurant_name: formData.restaurant_name,
      issue_description: formData.issue_description,
      severity: formData.severity,
      action_taken: formData.action_taken,
      notes: formData.notes || null,
    });

    if (!error) {
      setShowForm(false);
      setFormData({ restaurant_name: "", issue_description: "", severity: "medium", action_taken: "", notes: "" });
      fetchActions();
    }
  };

  const markResolved = async (id: string) => {
    const { error } = await supabase
      .from("corrective_actions")
      .update({ resolved: true, resolved_at: new Date().toISOString() })
      .eq("id", id);

    if (!error) {
      fetchActions();
    }
  };

  const markOpen = async (id: string) => {
    const { error } = await supabase
      .from("corrective_actions")
      .update({ resolved: false, resolved_at: null })
      .eq("id", id);

    if (!error) {
      fetchActions();
    }
  };

  const filteredActions = actions.filter((action) => {
    if (filter === "open") return !action.resolved;
    if (filter === "resolved") return action.resolved;
    return true;
  });

  const openCount = actions.filter((a) => !a.resolved).length;
  const resolvedCount = actions.filter((a) => a.resolved).length;

  return (
    <div>
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Corrective Actions</h1>
          <p className="text-gray-600 mt-1">Track and resolve food safety issues</p>
        </div>
        <button
          onClick={() => setShowForm(!showForm)}
          className="bg-green-600 text-white px-4 py-2 rounded-lg font-semibold hover:bg-green-700 transition-colors flex items-center gap-2"
        >
          <span>+</span> Log Issue
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        <div className="bg-white rounded-xl border border-gray-200 p-4 text-center">
          <p className="text-2xl font-bold text-gray-900">{actions.length}</p>
          <p className="text-sm text-gray-600">Total</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-4 text-center">
          <p className="text-2xl font-bold text-orange-600">{openCount}</p>
          <p className="text-sm text-gray-600">Open</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-4 text-center">
          <p className="text-2xl font-bold text-green-600">{resolvedCount}</p>
          <p className="text-sm text-gray-600">Resolved</p>
        </div>
      </div>

      {/* Add Issue Form */}
      {showForm && (
        <div className="bg-white rounded-xl border border-gray-200 p-6 mb-8">
          <h2 className="text-lg font-semibold mb-4">Log New Issue</h2>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Restaurant</label>
                <input
                  type="text"
                  value={formData.restaurant_name}
                  onChange={(e) => setFormData({ ...formData, restaurant_name: e.target.value })}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500"
                  placeholder="Restaurant name"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Severity</label>
                <select
                  value={formData.severity}
                  onChange={(e) => setFormData({ ...formData, severity: e.target.value })}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500"
                >
                  <option value="low">Low</option>
                  <option value="medium">Medium</option>
                  <option value="high">High</option>
                  <option value="critical">Critical</option>
                </select>
              </div>

              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-gray-700 mb-1">Issue Description</label>
                <textarea
                  value={formData.issue_description}
                  onChange={(e) => setFormData({ ...formData, issue_description: e.target.value })}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500"
                  placeholder="Describe the food safety issue..."
                  rows={3}
                  required
                />
              </div>

              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-gray-700 mb-1">Action Taken</label>
                <textarea
                  value={formData.action_taken}
                  onChange={(e) => setFormData({ ...formData, action_taken: e.target.value })}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500"
                  placeholder="What corrective action was taken?"
                  rows={2}
                  required
                />
              </div>

              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-gray-700 mb-1">Notes (optional)</label>
                <input
                  type="text"
                  value={formData.notes}
                  onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
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
                Save Issue
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

      {/* Filter Tabs */}
      <div className="flex gap-2 mb-6">
        {(["all", "open", "resolved"] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setFilter(tab)}
            className={`px-4 py-2 rounded-lg font-medium text-sm transition-colors ${
              filter === tab
                ? "bg-green-600 text-white"
                : "bg-white text-gray-700 border border-gray-200 hover:bg-gray-50"
            }`}
          >
            {tab.charAt(0).toUpperCase() + tab.slice(1)}
            {tab === "open" && openCount > 0 && (
              <span className="ml-1.5 bg-orange-500 text-white text-xs px-1.5 py-0.5 rounded-full">
                {openCount}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Issues List */}
      <div className="bg-white rounded-xl border border-gray-200">
        {loading ? (
          <div className="p-8 text-center text-gray-500">Loading...</div>
        ) : filteredActions.length === 0 ? (
          <div className="p-8 text-center text-gray-500">
            {filter === "all"
              ? "No corrective actions yet. Tap \"Log Issue\" to start."
              : `No ${filter} issues.`}
          </div>
        ) : (
          <div className="divide-y divide-gray-200">
            {filteredActions.map((action) => (
              <div key={action.id} className={`p-4 hover:bg-gray-50 ${action.resolved ? "bg-green-50/30" : ""}`}>
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${severityConfig[action.severity as keyof typeof severityConfig]?.color || "bg-gray-100 text-gray-700"}`}>
                        {severityConfig[action.severity as keyof typeof severityConfig]?.icon}{" "}
                        {severityConfig[action.severity as keyof typeof severityConfig]?.label || action.severity}
                      </span>
                      {action.resolved ? (
                        <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-700">
                          ✓ Resolved
                        </span>
                      ) : (
                        <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-orange-100 text-orange-700">
                          ● Open
                        </span>
                      )}
                    </div>
                    <p className="font-medium text-gray-900 mb-1">{action.issue_description}</p>
                    <p className="text-sm text-gray-600">{action.action_taken}</p>
                    {action.notes && (
                      <p className="text-sm text-gray-500 mt-1 italic">{action.notes}</p>
                    )}
                    <p className="text-xs text-gray-400 mt-2">
                      {action.restaurant_name} · {new Date(action.created_at).toLocaleString()}
                      {action.resolved_at && (
                        <span> · Resolved {new Date(action.resolved_at).toLocaleString()}</span>
                      )}
                    </p>
                  </div>
                  <div className="flex-shrink-0">
                    {action.resolved ? (
                      <button
                        onClick={() => markOpen(action.id)}
                        className="text-sm text-gray-600 hover:text-gray-900 border border-gray-300 px-3 py-1.5 rounded-lg hover:bg-gray-100 transition-colors"
                      >
                        Reopen
                      </button>
                    ) : (
                      <button
                        onClick={() => markResolved(action.id)}
                        className="text-sm text-white bg-green-600 hover:bg-green-700 px-3 py-1.5 rounded-lg transition-colors"
                      >
                        Resolve
                      </button>
                    )}
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
