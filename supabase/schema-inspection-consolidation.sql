-- Inspection consolidation — the shared InspectionForm (src/components/InspectionForm.tsx).
-- Run AFTER schema-rbac.sql (corporate_inspections) and schema-btb-public.sql.
-- Idempotent (safe to re-run).
--
-- All three flows now save to corporate_inspections, discriminated by
-- inspection_type: 'corporate' | 'in-house' | 'franchisee'. Legacy in-house
-- rows in inhouse_inspections are backfilled below so the History tab keeps
-- its records. Per-point photo proofs live inside the sections JSONB
-- (item.photos = ops-photos object paths).

ALTER TABLE corporate_inspections
  ADD COLUMN IF NOT EXISTS inspection_type TEXT NOT NULL DEFAULT 'corporate';
CREATE INDEX IF NOT EXISTS idx_corporate_inspections_type ON corporate_inspections(inspection_type);

-- Backfill legacy in-house inspections (rating recomputed on the app's scale).
INSERT INTO corporate_inspections (
  user_id, restaurant_name, inspection_date, inspector_name, inspector_role,
  sections, overall_score, max_score, rating, strengths, improvements,
  action_items, notes, inspection_type, created_at
)
SELECT
  i.user_id, i.restaurant_name, i.inspection_date, i.inspector_name, 'Store Manager',
  i.sections, i.overall_score, i.max_score,
  CASE
    WHEN i.max_score > 0 AND i.overall_score IS NOT NULL THEN
      CASE
        WHEN 100.0 * i.overall_score / i.max_score >= 95 THEN 'excellent'
        WHEN 100.0 * i.overall_score / i.max_score >= 85 THEN 'good'
        WHEN 100.0 * i.overall_score / i.max_score >= 70 THEN 'satisfactory'
        WHEN 100.0 * i.overall_score / i.max_score >= 50 THEN 'needs_improvement'
        ELSE 'critical'
      END
  END,
  '', '', '[]', COALESCE(i.notes, ''), 'in-house', i.created_at
FROM inhouse_inspections i
WHERE NOT EXISTS (
  SELECT 1 FROM corporate_inspections c
  WHERE c.user_id = i.user_id
    AND c.inspection_date = i.inspection_date
    AND c.inspector_name = i.inspector_name
    AND c.created_at = i.created_at
);

-- Demo-grade public RLS for the cookie-authed BTB tablet (no Supabase
-- session), same pattern as schema-btb-public.sql — policies are OR'd with
-- the management-tier policy from schema-rbac.sql.
ALTER TABLE corporate_inspections ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "corporate_inspections_btb_public" ON corporate_inspections;
CREATE POLICY "corporate_inspections_btb_public" ON corporate_inspections
  FOR ALL USING (true) WITH CHECK (true);
