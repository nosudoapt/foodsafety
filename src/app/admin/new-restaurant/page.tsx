"use client";

import { useEffect, useMemo, useState } from "react";
import { Rocket, Check, RotateCcw, CalendarClock } from "lucide-react";
import {
  PageHeader,
  Card,
  Button,
  Badge,
  Progress,
  EmptyState,
} from "@/components/ui";
import { supabase } from "@/lib/supabase";
import {
  getSessionUser,
  getProfileContext,
  readLocal,
  writeLocal,
} from "@/lib/admin-store";

interface Phase {
  id: string;
  title: string;
  goal: string;
  tasks: { id: string; label: string }[];
}

const phases: Phase[] = [
  {
    id: "legal",
    title: "1 · Legal & lease",
    goal: "Entity, property, and permits locked in",
    tasks: [
      { id: "l1", label: "Sign lease / confirm location" },
      { id: "l2", label: "Register business entity" },
      { id: "l3", label: "Obtain business license" },
      { id: "l4", label: "Obtain health safety license" },
      { id: "l5", label: "Arrange business insurance" },
      { id: "l6", label: "Sign franchisee agreement (if applicable)" },
      { id: "l7", label: "Open business bank account" },
    ],
  },
  {
    id: "buildout",
    title: "2 · Build-out & equipment",
    goal: "Kitchen and front-of-house ready to pass inspection",
    tasks: [
      { id: "b1", label: "Complete renovations / build-out" },
      { id: "b2", label: "Install kitchen equipment & POS stations" },
      { id: "b3", label: "Install security system & cameras" },
      { id: "b4", label: "Fire suppression system installed & tested" },
      { id: "b5", label: "Hoods inspection sticker received" },
      { id: "b6", label: "Grease trap installed" },
      { id: "b7", label: "Internet & phone lines active" },
      { id: "b8", label: "Debit machine / payment terminals live" },
    ],
  },
  {
    id: "systems",
    title: "3 · Accounts & systems",
    goal: "Every login and vendor ready before opening week",
    tasks: [
      { id: "s1", label: "Location email created" },
      { id: "s2", label: "MYR POS configured" },
      { id: "s3", label: "Uber & DoorDash merchant accounts live" },
      { id: "s4", label: "Skup / delivery integrations connected" },
      { id: "s5", label: "GFS / vendor accounts opened" },
      { id: "s6", label: "Security alarm monitored & codes set" },
      { id: "s7", label: "All logins stored in Login Vault" },
      { id: "s8", label: "Canadian Linen & pest control scheduled" },
    ],
  },
  {
    id: "people",
    title: "4 · People & training",
    goal: "Team hired, certified, and handbook-signed",
    tasks: [
      { id: "p1", label: "Hire management team" },
      { id: "p2", label: "Hire front & kitchen staff" },
      { id: "p3", label: "Food handler certificates collected" },
      { id: "p4", label: "Training modules completed" },
      { id: "p5", label: "Employee handbook signed by all" },
      { id: "p6", label: "Emergency contacts posted in BOH" },
      { id: "p7", label: "Opening / closing checklists trained" },
    ],
  },
  {
    id: "launch",
    title: "5 · Pre-launch & open",
    goal: "Soft open done, marketing live, doors open",
    tasks: [
      { id: "o1", label: "Soft opening / friends & family run" },
      { id: "o2", label: "Menu, allergen chart & cheat sheets printed" },
      { id: "o3", label: "Cleaning schedule & temp sheets set up" },
      { id: "o4", label: "Pest control first monthly report filed" },
      { id: "o5", label: "Marketing posters & social calendar uploaded" },
      { id: "o6", label: "Store promotion request submitted (2 mo ahead)" },
      { id: "o7", label: "Corporate opening inspection passed" },
      { id: "o8", label: "Grand opening" },
    ],
  },
];

const STORAGE_KEY = "btb-new-restaurant";

export default function NewRestaurantPage() {
  const [completed, setCompleted] = useState<Record<string, boolean>>({});
  const [restaurant, setRestaurant] = useState("");
  const [targetOpen, setTargetOpen] = useState("");
  const [loaded, setLoaded] = useState(false);
  const [nowMs, setNowMs] = useState(0);

  useEffect(() => {
    let cancelled = false;
    const raf = requestAnimationFrame(() => {
      void (async () => {
        setNowMs(Date.now());
        const user = await getSessionUser();
        if (cancelled) return;
        if (user) {
          const { data, error } = await supabase
            .from("restaurant_opening_checklist")
            .select("*")
            .eq("user_id", user.id)
            .eq("checklist_name", "new_restaurant")
            .order("updated_at", { ascending: false })
            .limit(1)
            .maybeSingle();
          if (!cancelled && !error && data) {
            const completed =
              data.completed && typeof data.completed === "object"
                ? (data.completed as Record<string, boolean>)
                : {};
            setCompleted(completed);
            setRestaurant(String(data.restaurant_name || ""));
            setTargetOpen(String(data.target_open_date || ""));
            setLoaded(true);
            return;
          }
        }
        if (!cancelled) {
          const raw = readLocal<{
            completed?: Record<string, boolean>;
            restaurant?: string;
            targetOpen?: string;
          }>(STORAGE_KEY, {});
          if (raw.completed) setCompleted(raw.completed);
          if (raw.restaurant) setRestaurant(raw.restaurant);
          if (raw.targetOpen) setTargetOpen(raw.targetOpen);
        }
        setLoaded(true);
      })();
    });
    return () => {
      cancelled = true;
      cancelAnimationFrame(raf);
    };
  }, []);

  useEffect(() => {
    if (!loaded) return;
    writeLocal(STORAGE_KEY, { completed, restaurant, targetOpen });
    void (async () => {
      const user = await getSessionUser();
      if (!user) return;
      const ctx = await getProfileContext();
      const name = restaurant || ctx.restaurantName;
      const doneCount = Object.values(completed).filter(Boolean).length;
      const total = phases.flatMap((p) => p.tasks).length;
      const status =
        doneCount === total ? "completed" : doneCount > 0 ? "in_progress" : "planned";
      const { data: existing } = await supabase
        .from("restaurant_opening_checklist")
        .select("id")
        .eq("user_id", user.id)
        .eq("checklist_name", "new_restaurant")
        .maybeSingle();
      const payload = {
        user_id: user.id,
        restaurant_name: name,
        target_open_date: targetOpen || null,
        completed,
        sections: phases.map((p) => ({
          id: p.id,
          title: p.title,
          tasks: p.tasks.map((t) => ({ ...t, done: !!completed[t.id] })),
        })),
        status,
        updated_at: new Date().toISOString(),
      };
      if (existing?.id) {
        await supabase
          .from("restaurant_opening_checklist")
          .update(payload)
          .eq("id", existing.id);
      } else {
        await supabase.from("restaurant_opening_checklist").insert({
          ...payload,
          checklist_name: "new_restaurant",
        });
      }
    })();
  }, [completed, restaurant, targetOpen, loaded]);

  const allTasks = useMemo(() => phases.flatMap((p) => p.tasks), []);
  const doneCount = allTasks.filter((t) => completed[t.id]).length;
  const pct = Math.round((doneCount / allTasks.length) * 100);

  const phaseStats = (phase: Phase) => {
    const done = phase.tasks.filter((t) => completed[t.id]).length;
    return { done, total: phase.tasks.length, pct: Math.round((done / phase.tasks.length) * 100) };
  };

  const toggle = (id: string) => setCompleted((prev) => ({ ...prev, [id]: !prev[id] }));

  const reset = () => {
    if (!confirm("Clear all checklist progress for this restaurant?")) return;
    setCompleted({});
  };

  const daysUntilOpen =
    targetOpen && nowMs
      ? Math.ceil((new Date(targetOpen + "T12:00:00").getTime() - nowMs) / 86_400_000)
      : null;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Open a new restaurant"
        description="Step-by-step checklist from lease to grand opening. Check items off as they’re done — progress saves automatically."
        actions={
          <Button variant="secondary" onClick={reset}>
            <RotateCcw className="h-4 w-4" /> Reset
          </Button>
        }
      />

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <div className="flex flex-col sm:flex-row sm:items-center gap-4">
            <div className="flex-1">
              <label htmlFor="nr-name" className="block text-[11px] font-bold uppercase tracking-wider text-gray-400 mb-1">
                Location name
              </label>
              <input
                id="nr-name"
                value={restaurant}
                onChange={(e) => setRestaurant(e.target.value)}
                placeholder="e.g. BTB — Midtown"
                className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2.5 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-red-500/30 focus:border-red-400"
              />
            </div>
            <div className="sm:w-44">
              <label htmlFor="nr-date" className="block text-[11px] font-bold uppercase tracking-wider text-gray-400 mb-1">
                Target open date
              </label>
              <input
                id="nr-date"
                type="date"
                value={targetOpen}
                onChange={(e) => setTargetOpen(e.target.value)}
                className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2.5 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-red-500/30 focus:border-red-400"
              />
            </div>
          </div>

          <div className="mt-5 flex items-end justify-between mb-2">
            <div>
              <p className="text-[11px] font-bold uppercase tracking-wider text-gray-400">
                Overall progress
              </p>
              <p className="mt-0.5 text-2xl font-semibold text-gray-900">
                {pct}
                <span className="text-sm font-medium text-gray-400">%</span>
              </p>
            </div>
            <p className="text-[13px] text-gray-500">
              {doneCount} / {allTasks.length} tasks
            </p>
          </div>
          <Progress value={pct} tone={pct === 100 ? "green" : pct >= 40 ? "amber" : "red"} />
          {pct === 100 && (
            <div className="mt-4 flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-[13px] text-emerald-800">
              <Rocket className="h-4 w-4" /> All set — ready for grand opening!
            </div>
          )}
        </Card>

        <Card>
          {daysUntilOpen !== null && targetOpen ? (
            <div className="flex items-start gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-50 text-amber-600">
                <CalendarClock className="h-5 w-5" strokeWidth={1.75} />
              </div>
              <div>
                <p className="text-[11px] font-bold uppercase tracking-wider text-gray-400">
                  Countdown
                </p>
                <p className="mt-1 text-3xl font-semibold text-gray-900">
                  {daysUntilOpen < 0 ? "Overdue" : daysUntilOpen}
                </p>
                <p className="text-[13px] text-gray-500">
                  {daysUntilOpen < 0
                    ? `Target was ${targetOpen}`
                    : daysUntilOpen === 0
                    ? "Opening day"
                    : `days until ${targetOpen}`}
                </p>
              </div>
            </div>
          ) : (
            <EmptyState
              icon={<CalendarClock className="h-5 w-5" />}
              title="No target date"
              description="Set a target open date to start the countdown."
            />
          )}
        </Card>
      </div>

      <div className="space-y-4">
        {phases.map((phase) => {
          const stats = phaseStats(phase);
          const complete = stats.done === stats.total;
          return (
            <Card key={phase.id} padded={false}>
              <div className="flex flex-col gap-3 border-b border-gray-100 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <h2 className="text-[15px] font-semibold text-gray-900">{phase.title}</h2>
                    {complete && <Badge tone="green">Done</Badge>}
                  </div>
                  <p className="text-xs text-gray-500 mt-0.5">{phase.goal}</p>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  <div className="w-28">
                    <Progress value={stats.pct} tone={complete ? "green" : "red"} />
                  </div>
                  <span className="text-[12px] font-semibold text-gray-500 tabular-nums">
                    {stats.done}/{stats.total}
                  </span>
                </div>
              </div>

              <ul className="divide-y divide-gray-50">
                {phase.tasks.map((task) => {
                  const done = !!completed[task.id];
                  return (
                    <li key={task.id}>
                      <label
                        className="flex cursor-pointer items-center gap-3 px-5 py-3 transition-colors hover:bg-gray-50/80"
                      >
                        <input
                          type="checkbox"
                          checked={done}
                          onChange={() => toggle(task.id)}
                          className="peer sr-only"
                        />
                        <span
                          aria-hidden="true"
                          className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-md border transition-colors ${
                            done
                              ? "border-emerald-500 bg-emerald-500 text-white"
                              : "border-gray-300 bg-white text-transparent peer-focus-visible:ring-2 peer-focus-visible:ring-red-400"
                          }`}
                        >
                          <Check className="h-3.5 w-3.5" strokeWidth={3} />
                        </span>
                        <span
                          className={`text-[13.5px] transition-colors ${
                            done ? "text-gray-400 line-through" : "text-gray-700"
                          }`}
                        >
                          {task.label}
                        </span>
                      </label>
                    </li>
                  );
                })}
              </ul>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
