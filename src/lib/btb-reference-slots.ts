// The server owns exact title/category slots. Never fall back to an entire
// category: granting one reference does not grant the manual library.
export const BTB_REFERENCE_SLOTS = {
  "prep-manual": { page: "prep-manual", title: "Prep manual", category: "operations" },
  "recipe-chart": { page: "prep-manual", title: "Recipe chart (chewy sheet)", category: "operations" },
  "allergen-chart": { page: "allergen-chart", title: "Bun allergy chart", category: "safety" },
  "fryer-chart": { page: "fryer-timing", title: "Fryer chart", category: "safety" },
  "gluten-free": { page: "gluten-free", title: "Gluten-free menu", category: "operations" },
  "loyalty-manual": { page: "loyalty-rewards", title: "Loyalty manual", category: "training" },
} as const;

export type BtbReferenceSlot = keyof typeof BTB_REFERENCE_SLOTS;
