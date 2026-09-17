export const cleaningTasks = [
  "Griddle - Flat Top (including all sides and back)",
  "Dry Storage Area including floors and racks",
  "Line Cooler",
  "Fryer Oil Change (clean under and sides)",
  "Wall behind the kitchen line & hoods",
  "Chef Base Drawer",
  "Clean and organize all stand up coolers",
  "Clean and organize stand up freezers & chest freezer",
  "Clean and organize prep table including table n shelves",
  "Mop Sink & Mop Bucket",
  "Clean 3 Sink & Handwashing Sinks",
];

export function generateWeekDates(startDate: Date): string[] {
  const dates: string[] = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(startDate);
    d.setDate(d.getDate() + i);
    dates.push(d.toISOString().split("T")[0]);
  }
  return dates;
}

export function getWeekLabel(dates: string[]): string {
  const first = new Date(dates[0] + "T12:00:00");
  const last = new Date(dates[6] + "T12:00:00");
  const format = (d: Date) =>
    d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  return `${format(first)} – ${format(last)}`;
}
