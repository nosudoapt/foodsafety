// Fryer timing & portion guide — the values from the printed BTB fryer chart.
// Plain data so the page (and a future test) can read it directly. Times are
// the authoritative cook times; portions list Side/Full (or Kids) where the
// item is sold in more than one size.
export interface FryerItem {
  item: string;
  /** One or two portion lines, e.g. ["Side: 7oz", "Full: 14oz"]. */
  portion: string[];
  /** Fryer time as shown on the chart, e.g. "3:00 min". */
  time: string;
}

export const fryerItems: FryerItem[] = [
  { item: "Fries", portion: ["Side: 7oz", "Full: 14oz"], time: "3:00 min" },
  { item: "Yam Fries", portion: ["Side: 7oz", "Full: 14oz"], time: "2:30 min" },
  { item: "Pickles", portion: ["Side: 5 pcs", "Full: 8 pcs"], time: "3:00 min" },
  { item: "Onion Rings", portion: ["Side: 8 pcs", "Full: 16 pcs"], time: "2:30 min" },
  { item: "Chicken Tenders", portion: ["Kids: 2 pcs", "Full: 4 pcs"], time: "5:00 min" },
  { item: "Chicken Breast", portion: ["1 pc"], time: "5:00 min" },
  { item: "Cauliflower", portion: ["8 oz"], time: "3:30 min" },
  { item: "Mozza Sticks", portion: ["8 pcs"], time: "2:00 min" },
  { item: "Wings", portion: ["Side: 6 pcs", "Full: 10 pcs"], time: "6:30 min" },
  { item: "Ribs", portion: ["One size: 10 oz"], time: "6:30 min" },
  { item: "Aloo Tikki", portion: ["1 pc"], time: "3:00 min" },
];
