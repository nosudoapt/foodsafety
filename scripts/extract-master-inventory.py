#!/usr/bin/env python3
"""Regenerate the master inventory list from the owner's Numbers workbook.

Source of truth:
  reference-documents/Master Inventory-October 1.numbers

Emits:
  src/lib/inventory-master-list.ts          — the typed list the app reads
  supabase/schema-inventory-master-list.sql — the idempotent seed migration

The workbook is read with `numbers-parser` (pip install numbers-parser). When
that package is unavailable the committed snapshot scripts/master-inventory.json
is used instead, so the migration can always be reproduced offline:

  python3 scripts/extract-master-inventory.py            # use the .numbers file
  python3 scripts/extract-master-inventory.py --snapshot # use the JSON snapshot

Names are copied verbatim — spelling, capitalisation, punctuation and all. They
are printed on the count sheet and the crew recognises them; normalising them
is a regression, not a cleanup.
"""

from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
WORKBOOK = ROOT / "reference-documents" / "Master Inventory-October 1.numbers"
SNAPSHOT = ROOT / "scripts" / "master-inventory.json"
TS_OUT = ROOT / "src" / "lib" / "inventory-master-list.ts"
SQL_OUT = ROOT / "supabase" / "schema-inventory-master-list.sql"

# Standalone labels in column B that start a prep section instead of naming an
# item. Matched by text, not by row number: inserting a row in the workbook
# must not silently re-file half the list under the wrong heading.
SECTIONS = {"LRB", "Meats", "Sauces", "Dairy", "Produce", "Starches"}
# "LOCAL" is the heading over the hand-typed local-supplier block. It is a
# heading, not an item, but the block below it has no other label.
BARE_HEADINGS = {"LOCAL"}

CATEGORY_NAMES = {
    "dry storage": "Dry Storage",
    "cooler": "Cooler",
    "freezer": "Freezer",
    "special order": "SPECIAL ORDER",
    "unassigned": "Unassigned",
}


def parse_pack_size(raw):
    """The workbook's 'Pack size' cell — packets per case. Mostly numbers,
    sometimes written as strings; blank on rows the sheet leaves unpriced."""
    if raw is None:
        return None
    if isinstance(raw, (int, float)):
        return float(raw) if float(raw) > 0 else None
    text = str(raw).strip().replace(",", "").replace("$", "")
    try:
        value = float(text)
    except ValueError:
        return None
    return value if value > 0 else None


def parse_price(raw):
    """A price cell — a plain number, or '$1,234.56' typed by hand."""
    if raw is None:
        return None
    if isinstance(raw, (int, float)):
        value = float(raw)
        return round(value, 2) if value >= 0 else None
    text = str(raw).strip().replace("$", "").replace(",", "")
    try:
        value = float(text)
    except ValueError:
        return None
    return round(value, 2) if value >= 0 else None


def parse_item_number(raw):
    """The workbook's GFS item number — a whole number stored as a float."""
    if raw is None:
        return None
    try:
        value = float(raw)
    except (TypeError, ValueError):
        return None
    return int(value) if value.is_integer() and value > 0 else None


def parse_unit(raw):
    """A `Unit size` cell such as '2.27 KG' / '1/9 D' / 'portion' / '710ml'.

    Returns (quantity basis, human pack size or None). The basis is what the
    counter picks from the dropdown; the pack size is reference text only.
    """
    if raw is None:
        return ("ea", None)
    text = str(raw).strip()
    if not text:
        return ("ea", None)
    low = text.lower()

    # Pan/insert sizes: 1/9 D, 1/3 D, 1/6 S, 1/3S, 1/2 D.
    if re.fullmatch(r"1\s*/\s*\d\s*[a-z]?", low.replace(" ", "")):
        return ("pan", text)
    if low in ("portion", "por"):
        return ("portion", text)
    if low == "litres":
        return ("L", text)
    if low == "cambro":
        return ("cambro", text)

    for pattern, basis, suffix in (
        (r"([\d.,]+)\s*(?:un|units?|ea|pcs?)$", "ea", "ea"),
        (r"([\d.,]+)\s*(?:kg|kgs|kga)$", "kg", "kg"),
        (r"([\d.,]+)\s*(?:g|gr|grams?)$", "g", "g"),
        (r"([\d.,]+)\s*(?:lb|lbs)$", "lb", "lb"),
        (r"([\d.,]+)\s*oz$", "oz", "oz"),
        (r"([\d.,]+)\s*ml$", "ml", "ml"),
        (r"([\d.,]+)\s*(?:l|lt|ltr)$", "L", "L"),
    ):
        match = re.fullmatch(pattern, low)
        if match:
            return (basis, f"{match.group(1)} {suffix}")

    return ("ea", text)


def read_snapshot():
    data = json.loads(SNAPSHOT.read_text())
    return data["table1"], data["table2"]


def read_workbook():
    try:
        from numbers_parser import Document
    except ModuleNotFoundError:
        sys.exit("numbers-parser is not installed. Run with --snapshot, or "
                 "`pip install numbers-parser`.")

    doc = Document(str(WORKBOOK))
    sheet = doc.sheets[0]
    tables = {table.name: table for table in sheet.tables}

    def rows(table):
        return [[table.cell(r, c).value for c in range(table.num_cols)]
                for r in range(table.num_rows)]

    # Table 1 = the GFS/local catalogue, Table 2 = the walk-in and beverage sheet.
    return rows(tables["Table 1"]), rows(tables["Table 2"])


def build(table1, table2):
    items, section = [], None

    for row in table1[1:]:
        name = (row[1] or "").strip()
        if not name:
            continue
        if name.upper() in BARE_HEADINGS:
            continue
        if name in SECTIONS:
            section = name
            continue
        unit, unit_size = parse_unit(row[2])
        raw_category = (row[4] or "").strip() if row[4] else ""
        category = CATEGORY_NAMES.get(raw_category.lower(), raw_category) or section
        items.append({"name": name, "unit": unit, "unit_size": unit_size,
                      "category": category,
                      "item_number": parse_item_number(row[0]),
                      "pack_size": parse_pack_size(row[3]),
                      "case_price": parse_price(row[5])})

    for row in table2:
        name = (row[0] or "").strip()
        if not name:
            continue
        unit, unit_size = "ea", None
        if isinstance(row[4], str):
            token = row[4].strip().lower()
            if token.endswith("box"):
                unit = "box"
            elif token.endswith("pack"):
                unit = "pack"
            elif token.endswith(("litre", "ltr")):
                unit = "L"
            else:
                try:
                    float(token)
                except ValueError:
                    unit_size = row[4].strip()
        items.append({"name": name, "unit": unit, "unit_size": unit_size,
                      "category": None,
                      "item_number": None,
                      "pack_size": None,
                      "case_price": None})

    # Table 1 wins when a name appears in both sheets.
    seen, unique = set(), []
    for item in items:
        key = item["name"].strip().lower()
        if key in seen:
            continue
        seen.add(key)
        unique.append(item)

    for position, item in enumerate(unique):
        item["position"] = position
    return unique


def quote(value):
    if value is None or value == "":
        return "null"
    return "'" + str(value).replace("'", "''") + "'"


def write_ts(items):
    out = [
        "// Master inventory list — extracted verbatim from",
        "// reference-documents/Master Inventory-October 1.numbers (sheet \"Sheet1\").",
        "//",
        "// Every name below keeps the spelling, capitalisation and punctuation of the",
        "// source sheet: \"Allo tiki\", \"7up\", \"Dr Pepper 2Ltr\", \"Pullock bites\",",
        "// \"Bacon, Center Cut, +/-1 Slice, 14 Slices per 2In, Raw, Fresh\". Do not",
        "// normalise them — the crew reads these names off the printed count sheet.",
        "//",
        "// This list is APPEND-ONLY. Rows seeded from it carry `protected = true` in",
        "// the database (supabase/schema-inventory-master-list.sql) and a trigger",
        "// refuses to delete or rename them. New items may be added on top; these",
        "// names never go away.",
        "//",
        "// Regenerate with: python3 scripts/extract-master-inventory.py",
        "//",
        "// Pricing formulas from the workbook, kept per item:",
        "//   packet (per unit) = case_price ÷ pack_size     — seeded as unit_cost",
        "//   line value        = count × unit_cost          — or × case_price when counted by case",
        "",
        "/** Quantity basis a count is entered in — the dropdown beside each item. */",
        "export const INVENTORY_UNITS = [",
        '  { value: "ea", label: "ea — each", note: "counted one by one (wraps, lids, patties)" },',
        '  { value: "kg", label: "kg — kilograms", note: "weighed" },',
        '  { value: "g", label: "g — grams", note: "weighed, small packs" },',
        '  { value: "lb", label: "lb — pounds", note: "weighed" },',
        '  { value: "oz", label: "oz — ounces", note: "weighed" },',
        '  { value: "L", label: "L — litres", note: "sauces, oils, dairy, drinks" },',
        '  { value: "ml", label: "ml — millilitres", note: "bottles and cans" },',
        '  { value: "box", label: "box", note: "whole boxes" },',
        '  { value: "pack", label: "pack", note: "whole packs" },',
        '  { value: "case", label: "case", note: "whole cases" },',
        '  { value: "portion", label: "portion", note: "pre-portioned product" },',
        '  { value: "pan", label: "pan", note: "insert / pan counts (1/9 D, 1/3 D, 1/6 S)" },',
        '  { value: "cambro", label: "cambro", note: "cambro container" },',
        "] as const;",
        "",
        'export type InventoryUnit = (typeof INVENTORY_UNITS)[number]["value"];',
        "",
        "export const INVENTORY_UNIT_VALUES: readonly string[] = INVENTORY_UNITS.map((unit) => unit.value);",
        "",
        "/** Unknown units are rejected instead of silently inventing a new basis. */",
        "export function isInventoryUnit(value: unknown): value is InventoryUnit {",
        '  return typeof value === "string" && INVENTORY_UNIT_VALUES.includes(value);',
        "}",
        "",
        "/** Short label for a stored unit value; unknown values pass through as-is. */",
        "export function inventoryUnitLabel(value: string | null | undefined): string {",
        "  if (!value) return \"ea\";",
        "  return INVENTORY_UNITS.find((unit) => unit.value === value)?.value ?? value;",
        "}",
        "",
        "export interface MasterInventoryItem {",
        "  /** Exactly as written on the master sheet. */",
        "  name: string;",
        "  /** Quantity basis for the count. */",
        "  unit: InventoryUnit;",
        "  /** Source-sheet storage area: Dry Storage / Cooler / Freezer / a prep section. */",
        "  category: string | null;",
        "  /** Pack size printed on the sheet (\"10.0 ea\", \"2.27 kg\", \"1/9 D\"). Reference only. */",
        "  unit_size: string | null;",
        "  /** GFS item number from the workbook. Reference only. */",
        "  item_number: number | null;",
        "  /** Packets per case from the workbook's \"Pack size\" column. */",
        "  pack_size: number | null;",
        "  /** Case cost from the workbook's \"Case price\" column. Packet = case ÷ pack. */",
        "  case_price: number | null;",
        "  /** Sheet order — the count sheet keeps it. */",
        "  position: number;",
        "}",
        "",
        f"/** The {len(items)} items on the master sheet, catalogue rows first. */",
        "export const MASTER_INVENTORY_ITEMS: readonly MasterInventoryItem[] = [",
    ]
    for item in items:
        out.append(
            "  { name: %s, unit: %s, category: %s, unit_size: %s, item_number: %s, pack_size: %s, case_price: %s, position: %d },"
            % (json.dumps(item["name"], ensure_ascii=False),
               json.dumps(item["unit"]), json.dumps(item["category"]),
               json.dumps(item["unit_size"]),
               json.dumps(item["item_number"]), json.dumps(item["pack_size"]),
               json.dumps(item["case_price"]), item["position"])
        )
    out += [
        "];",
        "",
        "/** Lower-cased, trimmed name → item. Seeds and lookups share one key. */",
        "export const MASTER_INVENTORY_BY_NAME: ReadonlyMap<string, MasterInventoryItem> = new Map(",
        "  MASTER_INVENTORY_ITEMS.map((item) => [item.name.trim().toLowerCase(), item]),",
        ");",
        "",
        "export const MASTER_INVENTORY_COUNT = MASTER_INVENTORY_ITEMS.length;",
        "",
    ]
    TS_OUT.write_text("\n".join(out))


def num(value):
    if value is None:
        return "null"
    return str(value)


def write_sql(items):
    # Dollar-quoted literals keep source names verbatim; numbers go in bare.
    values = ",\n".join(
        "  (%s, %s, %s, %s, %d, %s, %s, %s)"
        % (quote(item["name"]), quote(item["unit"]), quote(item["unit_size"]),
           quote(item["category"]), item["position"],
           num(item["item_number"]), num(item["pack_size"]), num(item["case_price"]))
        for item in items
    )
    sql = f"""-- Master inventory list — the {len(items)} items from the owner's workbook
-- (reference-documents/Master Inventory-October 1.numbers), seeded once and
-- locked against removal.
--
-- GENERATED by scripts/extract-master-inventory.py — edit that script, not this
-- file, then re-run it. Idempotent: safe to re-run.
--
-- The rule this migration encodes: names may be ADDED, never taken away.
--   * `protected = true` marks a row seeded from the master sheet.
--   * `btb_guard_master_inventory_item()` refuses DELETE on those rows and
--     refuses a rename (a rename is a delete wearing a new label).
--   * Quantity basis (unit), category and unit cost stay editable — those are
--     corrections, not removals.
--   * Every seeded row carries the workbook's item number, pack size and case
--     price; unit cost is seeded as packet = case price ÷ pack size.
--
-- Needs inventory_items from schema-month-end-inventory.sql (step 20).

BEGIN;

ALTER TABLE inventory_items ADD COLUMN IF NOT EXISTS unit_size text;
ALTER TABLE inventory_items ADD COLUMN IF NOT EXISTS protected boolean NOT NULL DEFAULT false;
ALTER TABLE inventory_items ADD COLUMN IF NOT EXISTS item_number bigint;
ALTER TABLE inventory_items ADD COLUMN IF NOT EXISTS pack_size numeric(10,3);
ALTER TABLE inventory_items ADD COLUMN IF NOT EXISTS case_price numeric(10,2);

COMMENT ON COLUMN inventory_items.protected IS
  'Seeded from the owner''s master workbook. Cannot be deleted or renamed; unit and cost stay editable.';
COMMENT ON COLUMN inventory_items.unit_size IS
  'Pack size printed on the master sheet (10.0 ea / 2.27 kg / 1/9 D). Reference text.';
COMMENT ON COLUMN inventory_items.item_number IS
  'GFS item number from the master workbook. Reference text.';
COMMENT ON COLUMN inventory_items.pack_size IS
  'Packets per case from the master workbook ("Pack size"). Used for the case ↔ packet conversion.';
COMMENT ON COLUMN inventory_items.case_price IS
  'Case cost from the master workbook ("Case price"). Packet price = case_price / pack_size.';

-- Append-only guard ---------------------------------------------------------
CREATE OR REPLACE FUNCTION btb_guard_master_inventory_item()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.protected THEN
      RAISE EXCEPTION 'Master inventory item cannot be deleted: %', OLD.name
        USING ERRCODE = '42501',
              HINT = 'The master list is append-only. Add a new item instead.';
    END IF;
    RETURN OLD;
  END IF;

  IF OLD.protected AND NEW.name IS DISTINCT FROM OLD.name THEN
    RAISE EXCEPTION 'Master inventory item cannot be renamed: % → %', OLD.name, NEW.name
      USING ERRCODE = '42501',
            HINT = 'Renaming a master item is a deletion. Add the corrected name as a new item.';
  END IF;

  IF OLD.protected AND NOT NEW.protected THEN
    RAISE EXCEPTION 'Master inventory item cannot be unprotected: %', OLD.name
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS inventory_items_append_only ON inventory_items;
CREATE TRIGGER inventory_items_append_only
  BEFORE UPDATE OR DELETE ON inventory_items
  FOR EACH ROW EXECUTE FUNCTION btb_guard_master_inventory_item();

-- Seed ----------------------------------------------------------------------
CREATE TEMP TABLE master_inventory_seed (
  name text NOT NULL,
  unit text NOT NULL,
  unit_size text,
  category text,
  position integer NOT NULL,
  item_number bigint,
  pack_size numeric(10,3),
  case_price numeric(10,2)
) ON COMMIT DROP;

INSERT INTO master_inventory_seed (name, unit, unit_size, category, position, item_number, pack_size, case_price) VALUES
{values};

-- An item the crew already typed by hand becomes protected instead of doubled.
UPDATE inventory_items item
   SET protected = true
  FROM master_inventory_seed seed
 WHERE item.location_id IS NULL
   AND NOT item.protected
   AND lower(trim(item.name)) = lower(trim(seed.name));

-- Rows already on the sheet keep the top of the list; the catalogue is laid out
-- after them. The offset is derived from the data, never remembered, so
-- re-running this file reproduces the same order instead of drifting.
CREATE TEMP TABLE master_inventory_layout ON COMMIT DROP AS
SELECT coalesce(max(item.position), -1) + 1 AS offset
  FROM inventory_items item
 WHERE item.location_id IS NULL
   AND NOT item.protected;

INSERT INTO inventory_items (name, unit, unit_size, category, unit_cost, position, location_id, protected, item_number, pack_size, case_price)
SELECT seed.name,
       seed.unit,
       seed.unit_size,
       seed.category,
       CASE WHEN seed.pack_size > 0 AND seed.case_price IS NOT NULL
            THEN round((seed.case_price / seed.pack_size)::numeric, 2)
            ELSE 0 END,
       seed.position + layout.offset,
       NULL,
       true,
       seed.item_number,
       seed.pack_size,
       seed.case_price
  FROM master_inventory_seed seed
 CROSS JOIN master_inventory_layout layout
 WHERE NOT EXISTS (
   SELECT 1 FROM inventory_items item
    WHERE item.location_id IS NULL
      AND lower(trim(item.name)) = lower(trim(seed.name))
 );

-- Backfill for databases seeded before the case/packet columns existed.
-- Protected rows gain the workbook's item number, pack size and case price, and
-- an unpriced ($0) packet cost is re-derived as packet = case ÷ pack. A cost
-- the manager typed deliberately is never touched.
UPDATE inventory_items item
   SET item_number = seed.item_number,
       pack_size = seed.pack_size,
       case_price = seed.case_price
  FROM master_inventory_seed seed
 WHERE item.location_id IS NULL
   AND item.protected
   AND lower(trim(item.name)) = lower(trim(seed.name));

UPDATE inventory_items item
   SET unit_cost = round((item.case_price / item.pack_size)::numeric, 2)
 WHERE item.location_id IS NULL
   AND item.protected
   AND item.unit_cost = 0
   AND item.pack_size > 0
   AND item.case_price IS NOT NULL;

-- Sheet order is authoritative for master rows. A re-run restores it if a later
-- edit shuffled positions; names, units, categories and costs stay untouched.
UPDATE inventory_items item
   SET position = seed.position + layout.offset
  FROM master_inventory_seed seed, master_inventory_layout layout
 WHERE item.location_id IS NULL
   AND item.protected
   AND lower(trim(item.name)) = lower(trim(seed.name));

COMMIT;
"""
    SQL_OUT.write_text(sql)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--snapshot", action="store_true",
                        help="read scripts/master-inventory.json instead of the workbook")
    parser.add_argument("--write-snapshot", action="store_true",
                        help="refresh scripts/master-inventory.json from the workbook")
    args = parser.parse_args()

    if args.snapshot:
        table1, table2 = read_snapshot()
    else:
        table1, table2 = read_workbook()
        if args.write_snapshot:
            SNAPSHOT.write_text(json.dumps({"table1": table1, "table2": table2},
                                           indent=1, default=str))

    items = build(table1, table2)
    write_ts(items)
    write_sql(items)
    print(f"{len(items)} items → {TS_OUT.relative_to(ROOT)}, {SQL_OUT.relative_to(ROOT)}")


if __name__ == "__main__":
    main()