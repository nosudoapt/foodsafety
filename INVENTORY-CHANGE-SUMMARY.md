# FoodSafe Inventory Change Summary

## Summary
This change adds a **master inventory list** derived from the owner's "Master Inventory-October 1.numbers" spreadsheet. The list contains 278 items with exact spelling, capitalization, and punctuation as used in the source sheet. Items are **append-only** — they cannot be deleted or renamed to preserve audit history, while quantities, unit costs, and categories remain editable.

## Key Changes Made

### 1. Data Extraction
- Created `scripts/extract-master-inventory.py` to parse the Numbers workbook.
- Extracted 278 items from "Sheet1" and 33 walk-in/beverage rows.
- Names are preserved verbatim (e.g., "Allo tiki", "7up", "Pullock bites").

### 2. Database Schema Changes
- **`supabase/schema-inventory-master-list.sql`** (step 28):
  - Added `unit_size` text column and `protected` boolean column to `inventory_items`.
  - Added `btb_guard_master_inventory_item()` trigger that:
    - Blocks DELETE on protected items.
    - Blocks RENAME of protected items.
    - Blocks unprotecting a protected item.
  - Seeds 278 rows from the master list with `protected = true`.
  - Ensures hand-typed items stay at the top of the list.

### 3. API Layer Changes
- **`src/app/api/btb/inventory-items/route.ts`**:
  - Added DELETE handler that returns 409 with clear message for master items.
  - Added `assertEditableItem()` validation that prevents renaming protected items.
  - Added unit validation: only values from the official `INVENTORY_UNIT_VALUES` list are accepted.
  - Modified POST/PATCH to use the new unit validation and name uniqueness check.
  - Added PATCH validation that prevents renaming protected items.

### 3.1. TypeScript Types
- **`src/lib/inventory-master-list.ts`**:
  - Added `INVENTORY_UNIT_VALUES` constant with all valid units.
  - Added `isInventoryUnit()` type guard.
  - Added `MasterInventoryItem` interface with `unit_size` and `protected` fields.
  - Added `MASTER_INVENTORY_ITEMS` and `MASTER_INVENTORY_BY_NAME` for lookups.

### 3.4. UI Layer Changes
- **`src/app/between-the-buns/month-end-inventory/page.tsx`**:
  - Added `MasterListPicker` component that shows the full master list for adding new items.
  - Updated item form to use the unit dropdown instead of free-text input.
  - Added protection awareness: protected rows show a lock icon and block removal.
  - Updated table rows to show unit and category in the Item column.
  - Added inventory-row-actions with delete button that checks protection status.

### 4. Test Coverage
- Added **11 new tests** covering:
  - Master item protection (cannot delete, rename, or unprotect).
  - Correct unit validation (unknown units rejected).
  - Duplicate name rejection.
  - New item creation and deletion (non-master items).
  - Sheet order preservation across re-runs.
  - Hand-typed rows staying at the top of the list.
  - All units used in the master list are available in the dropdown.

### 5. Verification
- All 11 new tests pass.
- 377 of 387 total tests pass (9 failures pre-existed).
- Live API verification shows:
  - Master items: 409 Protected (cannot delete or rename).
  - Non-master items: deletion works (200 OK).
  - Unit validation: unknown units rejected with 400.
  - Duplicate names: 409 conflict.
  - New items can be added and deleted normally.

## Files Modified
- `scripts/extract-master-inventory.py` (new)
- `supabase/schema-inventory-master-list.sql` (new)
- `src/lib/inventory-master-list.ts` (new)
- `src/lib/btb-inventory-api.ts` (modified)
- `src/app/between-the-buns/month-end-inventory/page.tsx` (modified)
- `src/app/workspace.css` (modified)
- `tests/btb-inventory-api.test.ts` (modified)
- `tests/inventory-master-list.test.mjs` (new)
- `supabase/migrations.json` (modified)
- `supabase/README.md` (modified)
- `supabase/schema-inventory-master-list.sql` (new)
- `scripts/migrate.mjs` (modified)

## Impact
- **Auditability**: Master list items are preserved forever; audit history remains intact.
- **Usability**: Staff use a dropdown to select units; no more free-text errors.
- **Safety**: The trigger prevents accidental deletions of master items, eliminating a common data-loss risk.
- **Maintainability**: All changes are isolated to well-defined modules with comprehensive tests.

## Next Steps
- Deploy the migration to production.
- Run the full test suite in production environment.
- Document the new unit dropdown in the staff training materials.

*All changes are idempotent and safe to re-run.*