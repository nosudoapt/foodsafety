"use client";

import { useState, useRef } from "react";
import { cleaningTasks, generateWeekDates, getWeekLabel } from "@/lib/btb-cleaning";

interface PhotoEntry {
  before: string | null;
  after: string | null;
}

interface TaskCompletion {
  [taskIndex: number]: {
    [date: string]: {
      initial: string;
      photos: PhotoEntry;
    };
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

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export default function CleaningSchedulePage() {
  const [currentWeekStart, setCurrentWeekStart] = useState(() => getStartOfWeek(new Date()));
  const [taskData, setTaskData] = useState<TaskCompletion>({});
  const [savedSchedules, setSavedSchedules] = useState<SavedSchedule[]>([]);
  const [activeTab, setActiveTab] = useState<"today" | "history">("today");
  const [photoModal, setPhotoModal] = useState<{ taskIdx: number; date: string } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploadType, setUploadType] = useState<"before" | "after">("before");

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
        [date]: {
          initial,
          photos: prev[taskIdx]?.[date]?.photos || { before: null, after: null },
        },
      },
    }));
  };

  const isTaskDone = (taskIdx: number, date: string) => {
    return !!taskData[taskIdx]?.[date]?.initial;
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

  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files?.[0] || !photoModal) return;
    const file = e.target.files[0];
    const base64 = await fileToBase64(file);

    setTaskData((prev) => {
      const current = prev[photoModal.taskIdx]?.[photoModal.date] || { initial: "", photos: { before: null, after: null } };
      return {
        ...prev,
        [photoModal.taskIdx]: {
          ...(prev[photoModal.taskIdx] || {}),
          [photoModal.date]: {
            ...current,
            photos: {
              ...current.photos,
              [uploadType]: base64,
            },
          },
        },
      };
    });

    setPhotoModal(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const removePhoto = (taskIdx: number, date: string, type: "before" | "after") => {
    setTaskData((prev) => {
      const current = prev[taskIdx]?.[date];
      if (!current) return prev;
      return {
        ...prev,
        [taskIdx]: {
          ...prev[taskIdx],
          [date]: {
            ...current,
            photos: {
              ...current.photos,
              [type]: null,
            },
          },
        },
      };
    });
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
      {/* Photo Upload Modal */}
      {photoModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl p-6 w-full max-w-md">
            <h3 className="font-bold text-gray-900 mb-1">
              Upload {uploadType === "before" ? "Before" : "After"} Photo
            </h3>
            <p className="text-sm text-gray-500 mb-4">
              Task {photoModal.taskIdx + 1}: {cleaningTasks[photoModal.taskIdx]}
            </p>

            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              capture="environment"
              onChange={handlePhotoUpload}
              className="w-full mb-4"
            />

            <div className="flex gap-2">
              <button
                onClick={() => setPhotoModal(null)}
                className="flex-1 px-4 py-2 bg-gray-100 text-gray-700 rounded-lg font-medium hover:bg-gray-200"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

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
            <div className="bg-white rounded-xl border border-gray-200 overflow-x-auto">
              {/* Header Row */}
              <div className="grid grid-cols-[1fr_repeat(7,80px)] bg-gray-50 border-b border-gray-200 min-w-[700px]">
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
                  className={`grid grid-cols-[1fr_repeat(7,80px)] border-b border-gray-100 ${
                    taskIdx % 2 === 0 ? "bg-white" : "bg-gray-50"
                  } min-w-[700px]`}
                >
                  <div className="px-4 py-3 text-sm font-medium text-gray-900">
                    <span className="text-gray-400 mr-2">{taskIdx + 1}.</span>
                    {task}
                  </div>
                  {weekDates.map((date, dateIdx) => {
                    const isToday = new Date().toISOString().split("T")[0] === date;
                    const isDone = isTaskDone(taskIdx, date);
                    const photos = taskData[taskIdx]?.[date]?.photos;
                    return (
                      <div
                        key={dateIdx}
                        className={`border-l border-gray-200 flex flex-col items-center justify-center py-1 gap-1 ${
                          isToday ? "bg-red-50" : ""
                        }`}
                      >
                        <input
                          type="text"
                          value={taskData[taskIdx]?.[date]?.initial || ""}
                          onChange={(e) =>
                            updateInitial(taskIdx, date, e.target.value.toUpperCase())
                          }
                          maxLength={3}
                          className={`w-12 h-8 text-center text-xs font-bold border-0 rounded ${
                            isDone
                              ? "bg-green-100 text-green-700"
                              : "bg-transparent text-gray-900 focus:ring-2 focus:ring-red-500"
                          }`}
                          placeholder="—"
                        />
                        {/* Photo buttons */}
                        {isDone && (
                          <div className="flex gap-0.5">
                            <button
                              onClick={() => {
                                setUploadType("before");
                                setPhotoModal({ taskIdx, date });
                              }}
                              className={`text-[8px] px-1 py-0.5 rounded font-medium ${
                                photos?.before
                                  ? "bg-blue-100 text-blue-700"
                                  : "bg-gray-100 text-gray-500 hover:bg-gray-200"
                              }`}
                              title={photos?.before ? "Before photo uploaded ✓" : "Upload before photo"}
                            >
                              📷B
                            </button>
                            <button
                              onClick={() => {
                                setUploadType("after");
                                setPhotoModal({ taskIdx, date });
                              }}
                              className={`text-[8px] px-1 py-0.5 rounded font-medium ${
                                photos?.after
                                  ? "bg-green-100 text-green-700"
                                  : "bg-gray-100 text-gray-500 hover:bg-gray-200"
                              }`}
                              title={photos?.after ? "After photo uploaded ✓" : "Upload after photo"}
                            >
                              📷A
                            </button>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>

            {/* Photo Preview */}
            {Object.keys(taskData).length > 0 && (
              <div className="mt-4">
                <h3 className="text-sm font-bold text-gray-700 mb-2">Uploaded Photos</h3>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  {Object.entries(taskData).map(([taskIdx, dates]) =>
                    Object.entries(dates).map(([date, data]) => {
                      if (typeof data === "string") return null;
                      const photos = data.photos;
                      if (!photos?.before && !photos?.after) return null;
                      return (
                        <div key={`${taskIdx}-${date}`} className="bg-white rounded-lg border border-gray-200 p-2">
                          <p className="text-[10px] font-bold text-gray-500 mb-1 truncate">
                            Task {Number(taskIdx) + 1} · {date}
                          </p>
                          <div className="flex gap-1">
                            {photos.before && (
                              <div className="relative flex-1">
                                <img
                                  src={photos.before}
                                  alt="Before"
                                  className="w-full h-16 object-cover rounded"
                                />
                                <span className="absolute bottom-0.5 left-0.5 bg-blue-600 text-white text-[7px] px-1 rounded">
                                  Before
                                </span>
                                <button
                                  onClick={() => removePhoto(Number(taskIdx), date, "before")}
                                  className="absolute top-0.5 right-0.5 bg-red-500 text-white w-3.5 h-3.5 rounded-full text-[8px] flex items-center justify-center"
                                >
                                  ✕
                                </button>
                              </div>
                            )}
                            {photos.after && (
                              <div className="relative flex-1">
                                <img
                                  src={photos.after}
                                  alt="After"
                                  className="w-full h-16 object-cover rounded"
                                />
                                <span className="absolute bottom-0.5 left-0.5 bg-green-600 text-white text-[7px] px-1 rounded">
                                  After
                                </span>
                                <button
                                  onClick={() => removePhoto(Number(taskIdx), date, "after")}
                                  className="absolute top-0.5 right-0.5 bg-red-500 text-white w-3.5 h-3.5 rounded-full text-[8px] flex items-center justify-center"
                                >
                                  ✕
                                </button>
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            )}

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
                let photoCount = 0;
                cleaningTasks.forEach((_, idx) => {
                  const dates = generateWeekDates(weekStart);
                  dates.forEach((date) => {
                    const entry = schedule.data[idx]?.[date];
                    if (entry) {
                      completedTasks++;
                      if (typeof entry === "object") {
                        if (entry.photos?.before) photoCount++;
                        if (entry.photos?.after) photoCount++;
                      }
                    }
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
                          {completedTasks}/{cleaningTasks.length * 7} tasks · {photoCount} photos · Saved{" "}
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
