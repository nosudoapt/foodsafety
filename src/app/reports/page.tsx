"use client";

import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";

type DateRange = "today" | "week" | "month" | "all";

interface TemperatureSummary {
  total: number;
  safe: number;
  unsafe: number;
  byType: Record<string, { total: number; safe: number; unsafe: number }>;
}

interface DailyCheckSummary {
  total: number;
  completed: number;
  partial: number;
  byType: Record<string, { total: number; completed: number }>;
}

interface CleaningSummary {
  total: number;
  completed: number;
  pending: number;
  byFrequency: Record<string, { total: number; completed: number }>;
}

interface CorrectiveActionsSummary {
  total: number;
  open: number;
  resolved: number;
  bySeverity: Record<string, number>;
}

const severityColors: Record<string, string> = {
  low: "bg-blue-100 text-blue-700",
  medium: "bg-yellow-100 text-yellow-700",
  high: "bg-orange-100 text-orange-700",
  critical: "bg-red-100 text-red-700",
};

const recordTypeLabels: Record<string, string> = {
  cooking: "Cooking",
  cooling: "Cooling",
  cold_storage: "Cold Storage",
  hot_holding: "Hot Holding",
  reheating: "Reheating",
  probe_calibration: "Probe Calibration",
};

const frequencyLabels: Record<string, string> = {
  daily: "Daily",
  weekly: "Weekly",
  monthly: "Monthly",
};

function getDateRangeFilter(range: DateRange): string | null {
  const now = new Date();
  if (range === "today") {
    return new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
  }
  if (range === "week") {
    const d = new Date(now);
    d.setDate(d.getDate() - 7);
    return d.toISOString();
  }
  if (range === "month") {
    const d = new Date(now);
    d.setMonth(d.getMonth() - 1);
    return d.toISOString();
  }
  return null;
}

export default function ReportsPage() {
  const [loading, setLoading] = useState(true);
  const [dateRange, setDateRange] = useState<DateRange>("week");
  const [temperatureData, setTemperatureData] = useState<any[]>([]);
  const [dailyChecksData, setDailyChecksData] = useState<any[]>([]);
  const [cleaningData, setCleaningData] = useState<any[]>([]);
  const [correctiveData, setCorrectiveData] = useState<any[]>([]);

  useEffect(() => {
    fetchAllData();
  }, [dateRange]);

  const fetchAllData = async () => {
    setLoading(true);
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (!session) {
      setLoading(false);
      return;
    }

    const userId = session.user.id;
    const since = getDateRangeFilter(dateRange);

    const [temps, checks, cleaning, actions] = await Promise.all([
      supabase
        .from("temperature_records")
        .select("*")
        .eq("user_id", userId)
        .then((r) => r.data || []),
      supabase
        .from("daily_checks")
        .select("*")
        .eq("user_id", userId)
        .then((r) => r.data || []),
      supabase
        .from("cleaning_records")
        .select("*")
        .eq("user_id", userId)
        .then((r) => r.data || []),
      supabase
        .from("corrective_actions")
        .select("*")
        .eq("user_id", userId)
        .then((r) => r.data || []),
    ]);

    const filterByDate = (items: any[], field: string) => {
      if (!since) return items;
      return items.filter((item) => new Date(item[field]) >= new Date(since));
    };

    setTemperatureData(filterByDate(temps, "recorded_at"));
    setDailyChecksData(filterByDate(checks, "created_at"));
    setCleaningData(filterByDate(cleaning, "created_at"));
    setCorrectiveData(filterByDate(actions, "created_at"));
    setLoading(false);
  };

  const temperatureSummary: TemperatureSummary = {
    total: temperatureData.length,
    safe: temperatureData.filter((r) => r.is_safe).length,
    unsafe: temperatureData.filter((r) => !r.is_safe).length,
    byType: temperatureData.reduce((acc, r) => {
      if (!acc[r.record_type]) acc[r.record_type] = { total: 0, safe: 0, unsafe: 0 };
      acc[r.record_type].total++;
      if (r.is_safe) acc[r.record_type].safe++;
      else acc[r.record_type].unsafe++;
      return acc;
    }, {} as Record<string, { total: number; safe: number; unsafe: number }>),
  };

  const dailyCheckSummary: DailyCheckSummary = {
    total: dailyChecksData.length,
    completed: dailyChecksData.filter((r) => r.completed).length,
    partial: dailyChecksData.filter((r) => !r.completed).length,
    byType: dailyChecksData.reduce((acc, r) => {
      if (!acc[r.check_type]) acc[r.check_type] = { total: 0, completed: 0 };
      acc[r.check_type].total++;
      if (r.completed) acc[r.check_type].completed++;
      return acc;
    }, {} as Record<string, { total: number; completed: number }>),
  };

  const cleaningSummary: CleaningSummary = {
    total: cleaningData.length,
    completed: cleaningData.filter((r) => r.completed).length,
    pending: cleaningData.filter((r) => !r.completed).length,
    byFrequency: cleaningData.reduce((acc, r) => {
      if (!acc[r.frequency]) acc[r.frequency] = { total: 0, completed: 0 };
      acc[r.frequency].total++;
      if (r.completed) acc[r.frequency].completed++;
      return acc;
    }, {} as Record<string, { total: number; completed: number }>),
  };

  const correctiveSummary: CorrectiveActionsSummary = {
    total: correctiveData.length,
    open: correctiveData.filter((r) => !r.resolved).length,
    resolved: correctiveData.filter((r) => r.resolved).length,
    bySeverity: correctiveData.reduce((acc, r) => {
      acc[r.severity] = (acc[r.severity] || 0) + 1;
      return acc;
    }, {} as Record<string, number>),
  };

  const overallSafeRate =
    temperatureSummary.total > 0
      ? Math.round((temperatureSummary.safe / temperatureSummary.total) * 100)
      : 0;

  const checkCompletionRate =
    dailyCheckSummary.total > 0
      ? Math.round((dailyCheckSummary.completed / dailyCheckSummary.total) * 100)
      : 0;

  const cleaningCompletionRate =
    cleaningSummary.total > 0
      ? Math.round((cleaningSummary.completed / cleaningSummary.total) * 100)
      : 0;

  const dateRangeLabel: Record<DateRange, string> = {
    today: "Today",
    week: "Last 7 Days",
    month: "Last 30 Days",
    all: "All Time",
  };

  return (
    <div>
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-8">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Reports</h1>
          <p className="text-gray-600 mt-1">Food safety compliance overview</p>
        </div>
        <button
          onClick={() => window.print()}
          className="bg-teal-600 text-white px-4 py-2 rounded-lg font-semibold hover:bg-teal-700 transition-colors flex items-center gap-2 justify-center"
        >
          <span>📄</span> Print Report
        </button>
      </div>

      {/* Date Range Filter */}
      <div className="flex gap-2 mb-8 overflow-x-auto pb-2">
        {(["today", "week", "month", "all"] as const).map((range) => (
          <button
            key={range}
            onClick={() => setDateRange(range)}
            className={`px-4 py-2 rounded-lg font-medium text-sm whitespace-nowrap transition-colors ${
              dateRange === range
                ? "bg-green-600 text-white"
                : "bg-white text-gray-700 border border-gray-200 hover:bg-gray-50"
            }`}
          >
            {dateRangeLabel[range]}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="bg-white rounded-xl border border-gray-200 p-12 text-center text-gray-500">
          Loading report data...
        </div>
      ) : (
        <>
          {/* Top-Level KPI Cards */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
            <div className="bg-white rounded-xl border border-gray-200 p-4">
              <div className="text-sm text-gray-600 mb-1">Temperature Safety</div>
              <div className={`text-2xl font-bold ${overallSafeRate >= 90 ? "text-green-600" : overallSafeRate >= 70 ? "text-yellow-600" : "text-red-600"}`}>
                {overallSafeRate}%
              </div>
              <div className="text-xs text-gray-500 mt-1">
                {temperatureSummary.safe} / {temperatureSummary.total} safe
              </div>
            </div>
            <div className="bg-white rounded-xl border border-gray-200 p-4">
              <div className="text-sm text-gray-600 mb-1">Check Completion</div>
              <div className={`text-2xl font-bold ${checkCompletionRate >= 90 ? "text-green-600" : checkCompletionRate >= 70 ? "text-yellow-600" : "text-red-600"}`}>
                {checkCompletionRate}%
              </div>
              <div className="text-xs text-gray-500 mt-1">
                {dailyCheckSummary.completed} / {dailyCheckSummary.total} complete
              </div>
            </div>
            <div className="bg-white rounded-xl border border-gray-200 p-4">
              <div className="text-sm text-gray-600 mb-1">Cleaning Completion</div>
              <div className={`text-2xl font-bold ${cleaningCompletionRate >= 90 ? "text-green-600" : cleaningCompletionRate >= 70 ? "text-yellow-600" : "text-red-600"}`}>
                {cleaningCompletionRate}%
              </div>
              <div className="text-xs text-gray-500 mt-1">
                {cleaningSummary.completed} / {cleaningSummary.total} tasks
              </div>
            </div>
            <div className="bg-white rounded-xl border border-gray-200 p-4">
              <div className="text-sm text-gray-600 mb-1">Open Issues</div>
              <div className={`text-2xl font-bold ${correctiveSummary.open === 0 ? "text-green-600" : correctiveSummary.open <= 3 ? "text-yellow-600" : "text-red-600"}`}>
                {correctiveSummary.open}
              </div>
              <div className="text-xs text-gray-500 mt-1">
                {correctiveSummary.resolved} resolved
              </div>
            </div>
          </div>

          {/* Temperature Records Summary */}
          <div className="bg-white rounded-xl border border-gray-200 mb-8">
            <div className="p-4 border-b border-gray-200">
              <h2 className="font-semibold text-gray-900 flex items-center gap-2">
                <span>🌡️</span> Temperature Records
              </h2>
            </div>
            {temperatureData.length === 0 ? (
              <div className="p-8 text-center text-gray-500">No temperature records for this period.</div>
            ) : (
              <div className="p-4">
                <div className="grid grid-cols-3 gap-4 mb-4">
                  <div className="text-center p-3 bg-gray-50 rounded-lg">
                    <div className="text-lg font-bold text-gray-900">{temperatureSummary.total}</div>
                    <div className="text-xs text-gray-600">Total Records</div>
                  </div>
                  <div className="text-center p-3 bg-green-50 rounded-lg">
                    <div className="text-lg font-bold text-green-600">{temperatureSummary.safe}</div>
                    <div className="text-xs text-gray-600">Safe</div>
                  </div>
                  <div className="text-center p-3 bg-red-50 rounded-lg">
                    <div className="text-lg font-bold text-red-600">{temperatureSummary.unsafe}</div>
                    <div className="text-xs text-gray-600">Out of Range</div>
                  </div>
                </div>

                {Object.keys(temperatureSummary.byType).length > 0 && (
                  <div className="border-t border-gray-100 pt-4">
                    <h3 className="text-sm font-medium text-gray-700 mb-3">Breakdown by Type</h3>
                    <div className="space-y-3">
                      {Object.entries(temperatureSummary.byType).map(([type, data]) => (
                        <div key={type}>
                          <div className="flex items-center justify-between text-sm mb-1">
                            <span className="text-gray-700">{recordTypeLabels[type] || type}</span>
                            <span className="text-gray-500">{data.total} records</span>
                          </div>
                          <div className="w-full h-2 bg-gray-100 rounded-full overflow-hidden">
                            <div
                              className="h-full bg-green-500 rounded-full"
                              style={{ width: `${data.total > 0 ? (data.safe / data.total) * 100 : 0}%` }}
                            />
                          </div>
                          <div className="flex justify-between text-xs text-gray-500 mt-0.5">
                            <span>{data.safe} safe</span>
                            <span>{data.unsafe} out of range</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Daily Checks Summary */}
          <div className="bg-white rounded-xl border border-gray-200 mb-8">
            <div className="p-4 border-b border-gray-200">
              <h2 className="font-semibold text-gray-900 flex items-center gap-2">
                <span>✅</span> Daily Kitchen Checks
              </h2>
            </div>
            {dailyChecksData.length === 0 ? (
              <div className="p-8 text-center text-gray-500">No daily checks for this period.</div>
            ) : (
              <div className="p-4">
                <div className="grid grid-cols-3 gap-4 mb-4">
                  <div className="text-center p-3 bg-gray-50 rounded-lg">
                    <div className="text-lg font-bold text-gray-900">{dailyCheckSummary.total}</div>
                    <div className="text-xs text-gray-600">Total Checks</div>
                  </div>
                  <div className="text-center p-3 bg-green-50 rounded-lg">
                    <div className="text-lg font-bold text-green-600">{dailyCheckSummary.completed}</div>
                    <div className="text-xs text-gray-600">Completed</div>
                  </div>
                  <div className="text-center p-3 bg-amber-50 rounded-lg">
                    <div className="text-lg font-bold text-amber-600">{dailyCheckSummary.partial}</div>
                    <div className="text-xs text-gray-600">Partial</div>
                  </div>
                </div>

                {Object.keys(dailyCheckSummary.byType).length > 0 && (
                  <div className="border-t border-gray-100 pt-4">
                    <h3 className="text-sm font-medium text-gray-700 mb-3">Breakdown by Type</h3>
                    <div className="space-y-3">
                      {Object.entries(dailyCheckSummary.byType).map(([type, data]) => (
                        <div key={type}>
                          <div className="flex items-center justify-between text-sm mb-1">
                            <span className="text-gray-700 capitalize">{type} Checks</span>
                            <span className="text-gray-500">{data.total} checks</span>
                          </div>
                          <div className="w-full h-2 bg-gray-100 rounded-full overflow-hidden">
                            <div
                              className="h-full bg-green-500 rounded-full"
                              style={{ width: `${data.total > 0 ? (data.completed / data.total) * 100 : 0}%` }}
                            />
                          </div>
                          <div className="flex justify-between text-xs text-gray-500 mt-0.5">
                            <span>{data.completed} completed</span>
                            <span>{data.total - data.completed} partial</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Cleaning Summary */}
          <div className="bg-white rounded-xl border border-gray-200 mb-8">
            <div className="p-4 border-b border-gray-200">
              <h2 className="font-semibold text-gray-900 flex items-center gap-2">
                <span>🧹</span> Cleaning &amp; Hygiene
              </h2>
            </div>
            {cleaningData.length === 0 ? (
              <div className="p-8 text-center text-gray-500">No cleaning records for this period.</div>
            ) : (
              <div className="p-4">
                <div className="grid grid-cols-3 gap-4 mb-4">
                  <div className="text-center p-3 bg-gray-50 rounded-lg">
                    <div className="text-lg font-bold text-gray-900">{cleaningSummary.total}</div>
                    <div className="text-xs text-gray-600">Total Tasks</div>
                  </div>
                  <div className="text-center p-3 bg-green-50 rounded-lg">
                    <div className="text-lg font-bold text-green-600">{cleaningSummary.completed}</div>
                    <div className="text-xs text-gray-600">Completed</div>
                  </div>
                  <div className="text-center p-3 bg-orange-50 rounded-lg">
                    <div className="text-lg font-bold text-orange-600">{cleaningSummary.pending}</div>
                    <div className="text-xs text-gray-600">Pending</div>
                  </div>
                </div>

                {Object.keys(cleaningSummary.byFrequency).length > 0 && (
                  <div className="border-t border-gray-100 pt-4">
                    <h3 className="text-sm font-medium text-gray-700 mb-3">Breakdown by Frequency</h3>
                    <div className="space-y-3">
                      {(["daily", "weekly", "monthly"] as const)
                        .filter((f) => cleaningSummary.byFrequency[f])
                        .map((freq) => {
                          const data = cleaningSummary.byFrequency[freq];
                          return (
                            <div key={freq}>
                              <div className="flex items-center justify-between text-sm mb-1">
                                <span className="text-gray-700">{frequencyLabels[freq]} Tasks</span>
                                <span className="text-gray-500">{data.total} tasks</span>
                              </div>
                              <div className="w-full h-2 bg-gray-100 rounded-full overflow-hidden">
                                <div
                                  className="h-full bg-green-500 rounded-full"
                                  style={{ width: `${data.total > 0 ? (data.completed / data.total) * 100 : 0}%` }}
                                />
                              </div>
                              <div className="flex justify-between text-xs text-gray-500 mt-0.5">
                                <span>{data.completed} completed</span>
                                <span>{data.total - data.completed} pending</span>
                              </div>
                            </div>
                          );
                        })}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Corrective Actions Summary */}
          <div className="bg-white rounded-xl border border-gray-200 mb-8">
            <div className="p-4 border-b border-gray-200">
              <h2 className="font-semibold text-gray-900 flex items-center gap-2">
                <span>🔧</span> Corrective Actions
              </h2>
            </div>
            {correctiveData.length === 0 ? (
              <div className="p-8 text-center text-gray-500">No corrective actions for this period.</div>
            ) : (
              <div className="p-4">
                <div className="grid grid-cols-3 gap-4 mb-4">
                  <div className="text-center p-3 bg-gray-50 rounded-lg">
                    <div className="text-lg font-bold text-gray-900">{correctiveSummary.total}</div>
                    <div className="text-xs text-gray-600">Total Issues</div>
                  </div>
                  <div className="text-center p-3 bg-orange-50 rounded-lg">
                    <div className="text-lg font-bold text-orange-600">{correctiveSummary.open}</div>
                    <div className="text-xs text-gray-600">Open</div>
                  </div>
                  <div className="text-center p-3 bg-green-50 rounded-lg">
                    <div className="text-lg font-bold text-green-600">{correctiveSummary.resolved}</div>
                    <div className="text-xs text-gray-600">Resolved</div>
                  </div>
                </div>

                {Object.keys(correctiveSummary.bySeverity).length > 0 && (
                  <div className="border-t border-gray-100 pt-4">
                    <h3 className="text-sm font-medium text-gray-700 mb-3">Breakdown by Severity</h3>
                    <div className="flex flex-wrap gap-3">
                      {Object.entries(correctiveSummary.bySeverity)
                        .sort(([a], [b]) => {
                          const order = { critical: 0, high: 1, medium: 2, low: 3 };
                          return (order[a as keyof typeof order] ?? 4) - (order[b as keyof typeof order] ?? 4);
                        })
                        .map(([severity, count]) => (
                          <div
                            key={severity}
                            className={`px-3 py-2 rounded-lg text-sm font-medium ${severityColors[severity] || "bg-gray-100 text-gray-700"}`}
                          >
                            {severity.charAt(0).toUpperCase() + severity.slice(1)}: {count}
                          </div>
                        ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Period Summary Footer */}
          <div className="bg-gray-50 rounded-xl border border-gray-200 p-6 text-center">
            <p className="text-sm text-gray-600">
              Showing data for <span className="font-semibold text-gray-900">{dateRangeLabel[dateRange]}</span>
            </p>
            <p className="text-xs text-gray-500 mt-1">
              Total records: {temperatureSummary.total + dailyCheckSummary.total + cleaningSummary.total + correctiveSummary.total} across all categories
            </p>
          </div>
        </>
      )}
    </div>
  );
}
