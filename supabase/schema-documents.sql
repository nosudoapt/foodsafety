-- Widen business_documents.doc_type to cover every expiring document the vault
-- tracks. The original CHECK only allowed 5 types; the shared DocumentVault
-- (src/components/DocumentVault.tsx) and the expiry engine (src/lib/expiry.ts)
-- now cover licenses, insurance, hood/fire certificates, pest reports and
-- franchise/lease agreements. Idempotent: safe to re-run.
--
-- Run order: after supabase/schema-rbac.sql (which creates business_documents).

ALTER TABLE business_documents
  DROP CONSTRAINT IF EXISTS business_documents_doc_type_check;

ALTER TABLE business_documents
  ADD CONSTRAINT business_documents_doc_type_check
  CHECK (doc_type IN (
    'health_license',
    'business_license',
    'business_insurance',
    'hood_inspection',
    'fire_suppression',
    'pest_control',
    'franchise_agreement',
    'lease_agreement',
    'food_inspection',
    'other',
    'insurance' -- legacy value from the pre-vault upload screen
  ));
