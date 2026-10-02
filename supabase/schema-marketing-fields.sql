-- Patch 8 — Marketing Material form fields.
--
-- MarketingBoard (src/components/MarketingBoard.tsx) now collects a category,
-- a poster/design size, the person the material is for and the target site on
-- the promotion form, and shows them on the card. Idempotent: safe to re-run.
--
-- Run order: after supabase/schema-rbac.sql (marketing_promotions) and
-- supabase/schema-locations.sql (locations). Until this file has been run the
-- marketing board reads the legacy columns and hides the four new inputs.

ALTER TABLE marketing_promotions
  ADD COLUMN IF NOT EXISTS category TEXT NOT NULL DEFAULT 'poster';

ALTER TABLE marketing_promotions
  ADD COLUMN IF NOT EXISTS size TEXT NOT NULL DEFAULT 'A4 Poster';

ALTER TABLE marketing_promotions
  ADD COLUMN IF NOT EXISTS person_name TEXT;

-- Losing a site never deletes the promotion — the card falls back to
-- "Removed location" (src/components/MarketingBoard.tsx).
ALTER TABLE marketing_promotions
  ADD COLUMN IF NOT EXISTS location_id UUID REFERENCES locations (id) ON DELETE SET NULL;

ALTER TABLE marketing_promotions
  DROP CONSTRAINT IF EXISTS marketing_promotions_category_check;

ALTER TABLE marketing_promotions
  ADD CONSTRAINT marketing_promotions_category_check
  CHECK (category IN (
    'poster',
    'flyer',
    'social',
    'story',
    'menu_board',
    'signage'
  ));
