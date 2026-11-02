/** The supplied franchise-opening checklist. Stable keys retain saved progress. */
export interface FranchiseGroup { title?: string; tasks: readonly string[] }
export interface FranchiseSection { number: number; title: string; groups: readonly FranchiseGroup[] }
export const FRANCHISE_SECTIONS: readonly FranchiseSection[] = [
  { number: 1, title: "Franchise & Corporate Setup", groups: [{ tasks: [
    "Franchise Agreement signed", "Franchise disclosure / required franchise documentation completed", "Franchise fee paid", "Franchise territory confirmed", "Corporation registered", "Business number", "PST/GST account", "Payroll account", "WCB account", "Corporate bank account", "Business credit card", "Merchant account", "Franchisee insurance", "Landlord/lease agreement", "Security deposit", "Utility accounts transferred/set up", "Accountant hired", "Bookkeeping system established", "Franchise royalty/payment setup", "Location email addresses",
  ] }] },
  { number: 2, title: "Licences & Permits", groups: [{ tasks: [
    "Business licence", "Saskatchewan Health / public health approval", "Food establishment permit/licence", "Food safety course", "Food Safety Manager certification, if required", "Fire inspection", "Fire Officer approval", "Building permit, if applicable", "Occupancy permit", "Electrical inspection/permit", "Plumbing permit/inspection", "Gas inspection/permit, if applicable", "Sign permit, if required", "SLGA licence, if selling alcohol", "Serve It Right certification for applicable staff",
  ] }] },
  { number: 3, title: "Lease, Building & Construction", groups: [{ tasks: [
    "Lease signed", "Landlord contact information", "Landlord's insurance requirements confirmed", "Key/fob/access received", "Door locks installed", "Door keys", "Alarm system", "Security system", "Camera system", "Internet cabling", "Electrical capacity confirmed", "Plumbing", "Water heater", "Grease trap", "Grease trap cleaning contract", "Floor drains", "RTUs", "HVAC", "Exhaust hood", "Make-up air unit", "Walk-in cooler/freezer, if applicable", "Refrigeration", "Emergency lighting", "Exit signs", "Fire extinguishers", "Fire suppression system", "Fire suppression inspection", "Hood installation", "Hood cleaning contract", "Painting", "Flooring", "Walls", "Ceiling", "Wallpaper", "Plumbing fixtures", "Hand sinks", "3-compartment sink", "Mop sink", "Washroom completed", "Accessibility requirements checked",
  ] }] },
  { number: 4, title: "Restaurant Equipment", groups: [
    { title: "Kitchen", tasks: ["Fryers", "Flat top", "Freezer", "Walk-in cooler", "Reach-in coolers", "Prep tables", "Line Cooler", "Microwave", "Shelving", "Storage racks", "Smallwares"] },
    { title: "Front of House", tasks: ["Tables", "Chairs", "Garbage/recycling bins", "Condiment station", "Napkin dispensers", "Serving Trays"] },
    { title: "Beverage", tasks: ["Pepsi cooler", "Coffee machine", "Red Bull cooler"] },
  ] },
  { number: 5, title: "Utilities & Services", groups: [{ tasks: [
    "Power", "Energy", "Water/sewer", "Internet", "Business phone", "Security/alarm monitoring", "Pest control", "Garbage collection", "Recycling", "Used cooking oil — Redux", "Grease trap service", "Hood cleaning", "HVAC service", "Refrigeration service", "Fire safety service", "Linen service", "Chemical dispensing system",
  ] }] },
  { number: 6, title: "POS & Technology", groups: [{ tasks: [
    "MYR POS", "Debit/credit machine", "Receipt Printer", "Kitchen printer", "Menu screens", "Online ordering system", "Online payment", "Online and 3rd party Delivery integration", "Music system", "Employee scheduling system", "Clock in and clock out system",
  ] }] },
  { number: 7, title: "Accounting & Financial Controls", groups: [{ tasks: ["Daily cash-out procedure", "Safe"] }] },
  { number: 8, title: "Suppliers", groups: [{ tasks: ["GFS Vendor Set up", "LRB Account Set up"] }] },
  { number: 9, title: "Menu Management", groups: [{ tasks: ["Prep Manual", "MYR Menu Pricing Setup"] }] },
  { number: 10, title: "Food Safety", groups: [{ tasks: ["Food Safety Course- Staff"] }] },
  { number: 11, title: "Staffing & HR", groups: [{ tasks: ["Staff Training", "Uniforms"] }] },
  { number: 12, title: "Marketing & Advertising", groups: [{ tasks: [
    "Facebook page", "Instagram", "Google Business Profile", "Website location addition", "Social media launch campaign", "Flyers", "School partnerships", "Sports team partnerships", "Community events", "Grand opening event", "Chamber of Commerce", "Local businesses",
  ] }] },
  { number: 13, title: "Promotional materials", groups: [{ tasks: ["Coupons", "Loyalty program", "Gift cards", "Opening promotion", "Discount cards", "Posters", "Stickers"] }] },
  { number: 14, title: "Signage & Store Appearance", groups: [{ tasks: [
    "Main exterior sign", "Secondary signage", "Window decals", "Door decals", "Business hours", "Open sign", "A-frame", "Counter Menu", "Digital screens", "Wallpaper", "Posters",
  ] }] },
  { number: 15, title: "Pre-Opening Inspection", groups: [
    { title: "7 Days Before Opening", tasks: [
      "All equipment operational", "Refrigerators working", "Freezers working", "POS operational", "Internet working", "Cameras working", "Security system working", "HVAC working", "Hood working", "Fire system approved", "Health approval received", "Staff hired", "Staff training completed", "Inventory received", "Menu loaded", "Online ordering working", "Delivery apps live", "Signage installed", "Google Business Profile live", "Social media live",
    ] },
    { title: "1 Day Before Opening", tasks: [
      "Full restaurant deep clean", "Food prep completed", "Inventory checked", "POS tested", "Debit tested", "Online orders tested", "Delivery apps tested", "Cash float prepared", "Staff schedule confirmed", "Uniforms ready", "Menus ready", "Packaging ready", "Music working", "Lights working", "Bathrooms stocked", "Garbage/recycling ready", "Exterior cleaned", "Opening promotion ready",
    ] },
  ] },
  { number: 16, title: "Grand Opening Day", groups: [{ tasks: [
    "Opening checklist", "Staff meeting", "Product quality check", "Food temperature check", "POS check", "Cash float", "Online ordering check", "Delivery platforms check", "Social media post", "Grand opening promotion", "Customer feedback", "Google review request", "Sales tracking", "Labour tracking", "End-of-day cash-out", "End-of-day inventory/waste check", "Closing checklist",
  ] }] },
];

export const FRANCHISE_TASKS = FRANCHISE_SECTIONS.flatMap((section) => section.groups.flatMap((group, groupIndex) => group.tasks.map((task, index) => ({
  key: `f${String(section.number).padStart(2, "0")}-${groupIndex + 1}-${String(index + 1).padStart(2, "0")}`,
  section: section.number, phase: section.title, group: group.title ?? "", task,
}))));

export interface FranchiseTaskState {
  task_key: string; phase: string; task: string; done: boolean; done_by_name: string | null;
  done_at: string | null; version: number; custom: boolean;
}
