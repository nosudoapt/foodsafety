// Daily Prep Sheet catalog — the client's new three-section layout, hardcoded
// exactly as transcribed (labels, units, section order and column shapes are
// the spec). Pure data: no imports, unit-testable (tests/btb-prep-list.test.ts).

export interface PrepItem {
  /** Exactly as printed on the sheet — what staff sees. */
  name: string;
  /**
   * Row key = prep_counts.item_name and the state key. Defaults to `name`;
   * only set where the same label appears twice — "Turkey" is both a meat
   * portion and a freezer pull, and they are different rows.
   */
  key?: string;
  /** Unit column (left/middle). The pull column has no unit cell, so Dairy's
   *  "Por" is rendered inside the item cell instead. */
  unit?: string;
}

/** "par" columns are Item/Unit/Par/OH/Make/Initial.
 *  "pull" columns are Item/OH/Pull/Initial — no Unit, Par or Make. */
export type PrepMode = "par" | "pull";

export interface PrepSection {
  title: string;
  items: PrepItem[];
}

export interface PrepColumn {
  /** Heading on the sheet: Left / Middle / Right. */
  label: string;
  mode: PrepMode;
  sections: PrepSection[];
}

export const prepColumns: PrepColumn[] = [
  {
    label: "Produce & Starches",
    mode: "par",
    sections: [
      {
        title: "Produce",
        items: [
          { name: "Burger Tomatoes", unit: "1/6 S" },
          { name: "Caramelized onions", unit: "1/6 S" },
          { name: "Cauliflower", unit: "por" },
          { name: "Coleslaw", unit: "1/3S" },
          { name: "Cucumber Sliced", unit: "1/9 D" },
          { name: "Grated Feta Cheese", unit: "1/9 D" },
          { name: "lemon wedge", unit: "1/9 D" },
          { name: "Red Onion diced", unit: "1/9 D" },
          { name: "Red Onion Sliced", unit: "1/9 D" },
          { name: "Red pepper diced", unit: "1/9 D" },
          { name: "Red Pepper Sliced", unit: "1/9 D" },
          { name: "Romaine", unit: "cambro" },
          { name: "Sliced mushroom", unit: "1/9 D" },
          { name: "Tomato Diced", unit: "1/9 D" },
        ],
      },
      {
        title: "Starches",
        items: [
          { name: "Breading", unit: "litres" },
          { name: "Cajun spice", unit: "litres" },
          { name: "Gravy", unit: "litres" },
          { name: "Oreo batter", unit: "litres" },
          { name: "Yam fries", unit: "por" },
        ],
      },
    ],
  },
  {
    label: "Sauces & Meats",
    mode: "par",
    sections: [
      {
        title: "Sauces",
        items: [
          { name: "Avocado Sauce", unit: "1/9 D" },
          { name: "Bacon ketchup", unit: "1/9 D" },
          { name: "Buffalo ranch", unit: "litres" },
          { name: "Chipotle mayo", unit: "litres" },
          { name: "Chipotle mint", unit: "1/9 D" },
          { name: "Greek dressing", unit: "litres" },
          { name: "Herbed mayo", unit: "litres" },
          { name: "Mint Chutney", unit: "litres" },
          { name: "Smoky mayo", unit: "1/9 D" },
          { name: "Spicy mayo", unit: "litres" },
          { name: "Spicy cranberry", unit: "1/9 D" },
        ],
      },
      {
        title: "Meats",
        items: [
          { name: "Bacon cooked", unit: "1/3 D" },
          { name: "Bison Patty", unit: "portion" },
          { name: "Boar Patty", unit: "portion" },
          { name: "Buttermilk tender", unit: "1/2 D" },
          { name: "Chicken butterfly", unit: "1/3 D" },
          { name: "Crispy chicken", unit: "portion" },
          { name: "Dry ribs", unit: "portion" },
          { name: "Elk patty", unit: "portion" },
          { name: "Lamb Patty", unit: "portion" },
          { name: "Turkey", unit: "portion" },
        ],
      },
    ],
  },
  {
    label: "Freezer pull & Dairy",
    mode: "pull",
    sections: [
      {
        title: "Freezer pull",
        items: [
          { name: "Guacamole" },
          { name: "Bacon" },
          { name: "Bison" },
          { name: "Boar" },
          { name: "Broiche buns" },
          { name: "Chicken tenders" },
          { name: "Chicken Breast 5oz" },
          { name: "Cod Fish" },
          { name: "Elk" },
          { name: "Lamb" },
          { name: "Naan bread" },
          { name: "Potato buns" },
          { name: "Pretzel buns" },
          { name: "Sesame buns" },
          // The Meats column already has a "Turkey" — distinct prep_counts row.
          { name: "Turkey", key: "Turkey (freezer)" },
          { name: "Wraps" },
        ],
      },
      {
        title: "Dairy",
        items: [
          { name: "Cheese curds", unit: "Por" },
          { name: "ice cream portion", unit: "Por" },
        ],
      },
    ],
  },
];

/** The key this row is stored under in prep_counts.item_name. */
export const itemKey = (item: PrepItem): string => item.key ?? item.name;

/** Every row key in sheet order — what load, save and PAR prefill iterate. */
export const prepCatalog: string[] = prepColumns.flatMap((col) =>
  col.sections.flatMap((section) => section.items.map(itemKey)),
);

/** Rows that carry a Par (left + middle columns) — the only ones PAR prefill
 *  and the manager-only Par gate apply to. */
export const parKeys: string[] = prepColumns
  .filter((col) => col.mode === "par")
  .flatMap((col) => col.sections.flatMap((section) => section.items.map(itemKey)));
