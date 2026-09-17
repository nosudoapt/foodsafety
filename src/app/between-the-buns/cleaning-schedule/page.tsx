"use client";

import { useState } from "react";
import { cleaningTasks, generateWeekDates, getWeekLabel } from "@/lib/btb-cleaning";

interface TaskCompletion {
  [taskIndex: number]: {
    [date: string]: string; // date -> initial
  };
}

interface SavedSchedule {
  id: string;
  weekStart: string;
  data: TaskCompletion;
  savedAt: string;
}

function getStartOfWeek(date: Date): Date {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  d.setDate(diff);
  return d;
}

export default function CleaningSchedulePage() {
  const [currentWeekStart, setCurrentWeekStart] = useState(() => getStartOfWeek(new Date()));
  const [taskData, setTaskData] = useState<TaskCompletion>({});
  const [savedSchedules, setSavedSchedules] = useState<SavedSchedule[]>([]);
  const [activeTab, setActiveTab] = useState<"today" | "history">("today");

  const weekDates = generateWeekDates(currentWeekStart);
  const weekLabel = getWeekLabel(weekDates);

  const goToPrevWeek = () => {
    const d = new Date(currentWeekStart);
    d.setDate(d.getDate() - 7);
    setCurrentWeekStart(d);
  };

  const goToNextWeek = () => {
    const d = new Date(currentWeekStart);
    d.setDate(d.getDate() + 7);
    setCurrentWeekStart(d);
  };

  const goToThisWeek = () => {
    setCurrentWeekStart(getStartOfWeek(new Date()));
  };

  const updateInitial = (taskIdx: number, date: string, initial: string) => {
    setTaskData((prev) => ({
      ...prev,
      [taskIdx]: {
        ...(prev[taskIdx] || {}),
        [date]: initial,
      },
    }));
  };

  const isTaskDone = (taskIdx: number, date: string) => {
    return !!taskData[taskIdx]?.[date];
  };

  const getCompletedCount = () => {
    let count = 0;
    cleaningTasks.forEach((_, idx) => {
      weekDates.forEach((date) => {
        if (isTaskDone(idx, date)) count++;
      });
    });
    return count;
  };

  const saveSchedule = () => {
    const newSchedule: SavedSchedule = {
      id: Date.now().toString(),
      weekStart: weekDates[0],
      data: JSON.parse(JSON.stringify(taskData)),
      savedAt: new Date().toISOString(),
    };
    setSavedSchedules((prev) => [newSchedule, ...prev].slice(0, 12));
    setActiveTab("history");
  };

  const loadSchedule = (schedule: SavedSchedule) => {
    const d = new Date(schedule.weekStart + "T12:00:00");
    setCurrentWeekStart(d);
    setTaskData(schedule.data);
    setActiveTab("today");
  };

  const deleteSchedule = (id: string) => {
    if (!confirm("Delete this schedule?")) return;
    setSavedSchedules((prev) => prev.filter((s) => s.id !== id));
  };

  const dayNames = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="max-w-6xl mx-auto px-4 py-4">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-10 h-10 bg-red-600 rounded-lg flex items-center justify-center">
              <span className="text-white font-bold text-sm">BTB</span>
            </div>
            <div>
              <h1 className="text-xl font-bold text-gray-900">Weekly Cleaning Schedule</h1>
              <p className="text-xs text-gray-500">Between the Buns — Each task done once per week</p>
            </div>
          </div>

          {/* Tabs */}
          <div className="flex gap-2">
            <button
              onClick={() => setActiveTab("today")}
              className={`px-4 py-2 rounded-lg text-sm font-semibold transition-colors ${
                activeTab === "today"
                  ? "bg-red-600 text-white"
                  : "bg-gray-100 text-gray-700 hover:bg-gray-200"
              }`}
            >
              This Week
            </button>
            <button
              onClick={() => setActiveTab("history")}
              className={`px-4 py-2 rounded-lg text-sm font-semibold transition-colors ${
                activeTab === "history"
                  ? "bg-red-600 text-white"
                  : "bg-gray-100 text-gray-700 hover:bg-gray-200"
              }`}
            >
              History ({savedSchedules.length})
            </button>
          </div>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-4 py-4">
        {activeTab === "today" ? (
          <>
            {/* Week Navigation */}
            <div className="flex items-center justify-between mb-4">
              <button
                onClick={goToPrevWeek}
                className="px-3 py-2 bg-white border border-gray-200 rounded-lg text-sm font-medium hover:bg-gray-50"
              >
                ← Prev
              </button>
              <div className="text-center">
                <p className="font-bold text-gray-900">{weekLabel}</p>
                <p className="text-xs text-gray-500">
                  {getCompletedCount()} of {cleaningTasks.length * 7} tasks completed
                </p>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={goToThisWeek}
                  className="px-3 py-2 bg-gray-100 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-200"
                >
                  Today
                </button>
                <button
                  onClick={goToNextWeek}
                  className="px-3 py-2 bg-white border border-gray-200 rounded-lg text-sm font-medium hover:bg-gray-50"
                >
                  Next →
                </button>
              </div>
            </div>

            {/* Schedule Table */}
            <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
              {/* Header Row */}
              <div className="grid grid-cols-[1fr_repeat(7,60px)] bg-gray-50 border-b border-gray-200">
                <div className="px-4 py-3 text-xs font-bold text-gray-500 uppercase">
                  Task
                </div>
                {weekDates.map((date, idx) => {
                  const d = new Date(date + "T12:00:00");
                  const isToday = new Date().toISOString().split("T")[0] === date;
                  return (
                    <div
                      key={idx}
                      className={`px-1 py-3 text-center border-l border-gray-200 ${
                        isToday ? "bg-red-50" : ""
                      }`}
                    >
                      <div className="text-[10px] font-bold text-gray-500 uppercase">
                        {dayNames[idx]}
                      </div>
                      <div className={`text-xs font-semibold ${isToday ? "text-red-600" : "text-gray-900"}`}>
                        {d.toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Task Rows */}
              {cleaningTasks.map((task, taskIdx) => (
                <div
                  key={taskIdx}
                  className={`grid grid-cols-[1fr_repeat(7,60px)] border-b border-gray-100 ${
                    taskIdx % 2 === 0 ? "bg-white" : "bg-gray-50"
                  }`}
                >
                  <div className="px-4 py-3 text-sm font-medium text-gray-900">
                    <span className="text-gray-400 mr-2">{taskIdx + 1}.</span>
                    {task}
                  </div>
                  {weekDates.map((date, dateIdx) => {
                    const isToday = new Date().toISOString().split("T")[0] === date;
                    const isDone = isTaskDone(taskIdx, date);
                    return (
                      <div
                        key={dateIdx}
                        className={`border-l border-gray-200 flex items-center justify-center ${
                          isToday ? "bg-red-50" : ""
                        }`}
                      >
                        <input
                          type="text"
                          value={taskData[taskIdx]?.[date] || ""}
                          onChange={(e) =>
                            updateInitial(taskIdx, date, e.target.value.toUpperCase())
                          }
                          maxLength={3}
                          className={`w-12 h-10 text-center text-xs font-bold border-0 rounded ${
                            isDone
                              ? "bg-green-100 text-green-700"
                              : "bg-transparent text-gray-900 focus:ring-2 focus:ring-red-500"
                          }`}
                          placeholder="—"
                        />
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>

            {/* Save Button */}
            <div className="mt-6 flex gap-3">
              <button
                onClick={saveSchedule}
                className="bg-red-600 text-white px-6 py-3 rounded-lg font-semibold hover:bg-red-700 transition-colors"
              >
                Save Week
              </button>
              <button
                onClick={() => setTaskData({})}
                className="bg-gray-100 text-gray-700 px-6 py-3 rounded-lg font-semibold hover:bg-gray-200 transition-colors"
              >
                Clear All
              </button>
            </div>
          </>
        ) : (
          /* History Tab */
          <div className="space-y-4">
            {savedSchedules.length === 0 ? (
              <div className="text-center py-12 bg-white rounded-xl border border-gray-200">
                <p className="text-gray-500">No saved schedules yet</p>
                <p className="text-gray-400 text-sm mt-1">
                  Fill out this week&apos;s schedule and save it
                </p>
              </div>
            ) : (
              savedSchedules.map((schedule) => {
                const weekStart = new Date(schedule.weekStart + "T12:00:00");
                const weekEnd = new Date(weekStart);
                weekEnd.setDate(weekEnd.getDate() + 6);
                const format = (d: Date) =>
                  d.toLocaleDateString("en-US", { month: "short", day: "numeric" });

                let completedTasks = 0;
                cleaningTasks.forEach((_, idx) => {
                  const dates = generateWeekDates(weekStart);
                  dates.forEach((date) => {
                    if (schedule.data[idx]?.[date]) completedTasks++;
                  });
                });

                return (
                  <div
                    key={schedule.id}
                    className="bg-white rounded-xl border border-gray-200 p-4"
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <h3 className="font-semibold text-gray-900">
                          {format(weekStart)} – {format(weekEnd)}
                        </h3>
                        <p className="text-xs text-gray-500">
                          {completedTasks}/{cleaningTasks.length * 7} tasks · Saved{" "}
                          {new Date(schedule.savedAt).toLocaleDateString()}
                        </p>
                      </div>
                      <div className="flex gap-2">
                        <button
                          onClick={() => loadSchedule(schedule)}
                          className="text-sm text-red-600 hover:text-red-700 font-medium"
                        >
                          Load
                        </button>
                        <button
                          onClick={() => deleteSchedule(schedule.id)}
                          className="text-sm text-gray-400 hover:text-red-500"
                        >
                          🗑️
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        )}
      </div>
    </div>
  );
}
