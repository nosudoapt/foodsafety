// Opening / closing duties — shared by the Daily Kitchen Checks page and the
// Daily Prep Sheet's Checklist tab, so the two never drift apart. Pure data:
// no imports, unit-testable, safe to load on the server.

export interface ChecklistItem {
  id: string;
  text: string;
  completed: boolean;
  section: string; // "Front" | "Kitchen"
}

export const defaultOpeningItems: ChecklistItem[] = [
  // Front Opening Duties
  { id: "o1", text: "Open Sign: Turn on the open sign at opening time", completed: false, section: "Front" },
  { id: "o2", text: "POS Tablets: Turn on all three tablets (Master, Customer, Kitchen) - ensure fully charged", completed: false, section: "Front" },
  { id: "o3", text: "Debit Machine: Check if working properly and fully charged", completed: false, section: "Front" },
  { id: "o4", text: "Menu TV: Turn on the menu TV display", completed: false, section: "Front" },
  { id: "o5", text: "Buns & Display Area: Put out fresh buns, set up display buns board, stock dippings", completed: false, section: "Front" },
  { id: "o6", text: "Bun Expiry Rule: Throw away old buns after 4 days and replace with fresh buns", completed: false, section: "Front" },
  { id: "o7", text: "Dine-In Tables: Check all tables in the dine-in area are clean", completed: false, section: "Front" },
  { id: "o8", text: "Napkin Dispensers: Check and refill napkin dispensers in dine-in area", completed: false, section: "Front" },
  { id: "o9", text: "Table Caddies: Check and refill all caddies (Ketchup, Mustard, Relish, Salt, Pepper, Vinegar)", completed: false, section: "Front" },
  { id: "o10", text: "Washroom: Ensure clean; check tissue paper and towel rolls are filled", completed: false, section: "Front" },
  { id: "o11", text: "Dine-In Floor: Check and make sure the dine-in floor is completely clean", completed: false, section: "Front" },
  // Back Kitchen Duties
  { id: "o12", text: "Exhaust Hoods: Turn on hoods", completed: false, section: "Kitchen" },
  { id: "o13", text: "Hot Plate: Set temperatures - Left Two Burners: 350°F, Right One Burner: 250°F", completed: false, section: "Kitchen" },
  { id: "o14", text: "Fryer: Turn on fryer and set to 350°F", completed: false, section: "Kitchen" },
  { id: "o15", text: "Toaster: Turn on toaster and switch button to buns mode", completed: false, section: "Kitchen" },
  { id: "o16", text: "Station Setup: Place all tools and equipment on stations (Flipper, Tongs, Scraper, Steamer dome, Bowls, Spreader)", completed: false, section: "Kitchen" },
  { id: "o17", text: "Line & Chef Base: Check line and chef base drawers; refill if needed", completed: false, section: "Kitchen" },
  { id: "o18", text: "Gravy Station: Heat up gravy on induction stove, then transfer to hot well", completed: false, section: "Kitchen" },
  { id: "o19", text: "Temperature Log: Fill out the temperature sheet", completed: false, section: "Kitchen" },
  { id: "o20", text: "Prep List: Make the list for prep work to do for the day", completed: false, section: "Kitchen" },
];

export const defaultClosingItems: ChecklistItem[] = [
  // Front Area
  { id: "c1", text: "Empty and throw away all garbage and recycling", completed: false, section: "Front" },
  { id: "c2", text: "Clean and wipe all tables; refill napkins, dispensers, and caddies if needed", completed: false, section: "Front" },
  { id: "c3", text: "Clean and sanitize washrooms; refill all supplies if needed", completed: false, section: "Front" },
  { id: "c4", text: "Turn off the TV menus", completed: false, section: "Front" },
  { id: "c5", text: "Turn off all three tablets (Master, Customer, Kitchen) and remove from charging overnight", completed: false, section: "Front" },
  { id: "c6", text: "Keep debit machine ON charging", completed: false, section: "Front" },
  { id: "c7", text: "Place all display buns and dipping sauces in cooler every night", completed: false, section: "Front" },
  { id: "c8", text: "Fully fill up the Pepsi cooler", completed: false, section: "Front" },
  { id: "c9", text: "Sweep and mop the front floor", completed: false, section: "Front" },
  { id: "c10", text: "Turn off OPEN sign and lock the door at exact closing time", completed: false, section: "Front" },
  // Kitchen Area
  { id: "c11", text: "Clean all dishes properly", completed: false, section: "Kitchen" },
  { id: "c12", text: "Clean hot plate with charcoal brick; throw away waste container contents and clean container", completed: false, section: "Kitchen" },
  { id: "c13", text: "Turn off hot plate, fryer, and bun toaster", completed: false, section: "Kitchen" },
  { id: "c14", text: "Remove gravy from hot well and keep in cooler", completed: false, section: "Kitchen" },
  { id: "c15", text: "Stock up line, chef base drawers, and dipping cooler", completed: false, section: "Kitchen" },
  { id: "c16", text: "Stock up milkshake and smoothie supplies (fruits, syrups, etc.)", completed: false, section: "Kitchen" },
  { id: "c17", text: "Cover the line properly at night", completed: false, section: "Kitchen" },
  { id: "c18", text: "Sweep and mop the kitchen floor", completed: false, section: "Kitchen" },
  { id: "c19", text: "Turn off kitchen hood and lights", completed: false, section: "Kitchen" },
  { id: "c20", text: "DOUBLE CHECK: All locks, appliances & lights before leaving", completed: false, section: "Kitchen" },
];

// Progress for a list: how many are ticked / how many there are.
export function checklistProgress(items: readonly ChecklistItem[]): { done: number; total: number } {
  return { done: items.filter((i) => i.completed).length, total: items.length };
}
