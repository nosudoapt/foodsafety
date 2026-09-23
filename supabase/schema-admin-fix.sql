-- Admin data migration support
-- Run AFTER schema.sql, schema-rbac.sql, schema-v2.sql

-- =====================================================
-- steps_to_do: missing user_id (RLS already assumes it)
-- =====================================================
ALTER TABLE steps_to_do ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES profiles(id);
ALTER TABLE steps_to_do ADD COLUMN IF NOT EXISTS title TEXT DEFAULT '';
ALTER TABLE steps_to_do ADD COLUMN IF NOT EXISTS subtitle TEXT DEFAULT '';
ALTER TABLE steps_to_do ADD COLUMN IF NOT EXISTS icon TEXT DEFAULT 'power';

DROP POLICY IF EXISTS "Users can manage steps_to_do" ON steps_to_do;
CREATE POLICY "Users can manage steps_to_do" ON steps_to_do
  FOR ALL USING (user_id = auth.uid() OR user_id IS NULL)
  WITH CHECK (user_id = auth.uid() OR user_id IS NULL);

-- =====================================================
-- login_information: vault fields
-- =====================================================
ALTER TABLE login_information ADD COLUMN IF NOT EXISTS url TEXT DEFAULT '';
ALTER TABLE login_information ADD COLUMN IF NOT EXISTS category TEXT DEFAULT 'Accounts';
ALTER TABLE login_information ADD COLUMN IF NOT EXISTS service_name TEXT;

-- =====================================================
-- handbook signatures: role + method + version
-- =====================================================
ALTER TABLE handbook_signatures ADD COLUMN IF NOT EXISTS role TEXT DEFAULT 'Staff';
ALTER TABLE handbook_signatures ADD COLUMN IF NOT EXISTS method TEXT DEFAULT 'typed';
ALTER TABLE handbook_signatures ADD COLUMN IF NOT EXISTS acknowledged_version TEXT DEFAULT '';
ALTER TABLE handbook_signatures ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES profiles(id);
ALTER TABLE handbook_signatures ALTER COLUMN handbook_id DROP NOT NULL;
ALTER TABLE login_information ALTER COLUMN username SET DEFAULT '';
ALTER TABLE login_information ALTER COLUMN password_encrypted SET DEFAULT '';

-- Allow managers/owners to select signatures for the active handbook page
DROP POLICY IF EXISTS "Managers can view signatures" ON handbook_signatures;
CREATE POLICY "Managers can view signatures" ON handbook_signatures
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid()
        AND role IN ('corporate', 'manager', 'owner', 'multi_location_owner')
    )
  );
CREATE POLICY "Users can manage handbook signatures" ON handbook_signatures
  FOR ALL USING (true) WITH CHECK (true);

-- employee_handbooks extras
ALTER TABLE employee_handbooks ADD COLUMN IF NOT EXISTS file_type TEXT DEFAULT 'application/pdf';
ALTER TABLE employee_handbooks ADD COLUMN IF NOT EXISTS uploaded_at DATE;

-- =====================================================
-- corporate_inspections: quarter + report + rubric
-- =====================================================
ALTER TABLE corporate_inspections ADD COLUMN IF NOT EXISTS quarter TEXT;
ALTER TABLE corporate_inspections ADD COLUMN IF NOT EXISTS report_file_name TEXT;
ALTER TABLE corporate_inspections ADD COLUMN IF NOT EXISTS report_data TEXT;
ALTER TABLE corporate_inspections ADD COLUMN IF NOT EXISTS rubric_source TEXT DEFAULT 'placeholder';
ALTER TABLE corporate_inspections ADD COLUMN IF NOT EXISTS rubric_link TEXT;

-- =====================================================
-- documents: align with admin UI categories + monthly fields
-- =====================================================
ALTER TABLE documents ADD COLUMN IF NOT EXISTS category_id TEXT;
ALTER TABLE documents ADD COLUMN IF NOT EXISTS doc_month INTEGER;
ALTER TABLE documents ADD COLUMN IF NOT EXISTS doc_year INTEGER;
ALTER TABLE documents ADD COLUMN IF NOT EXISTS uploaded_at DATE;
ALTER TABLE documents ADD COLUMN IF NOT EXISTS notes TEXT DEFAULT '';

-- Expand doc_category check to match admin UI
ALTER TABLE documents DROP CONSTRAINT IF EXISTS documents_doc_category_check;
ALTER TABLE documents ADD CONSTRAINT documents_doc_category_check CHECK (doc_category IN (
  'health_license', 'business_license', 'business_insurance',
  'food_inspection', 'pest_control', 'hoods_inspection',
  'fire_suppression', 'franchise_agreement', 'lease_agreement',
  'staff_certificate', 'other',
  'hoods_sticker', 'staff_certs', 'franchise', 'lease'
));

-- =====================================================
-- emergency_contacts: match UI group ids (TEXT, no tight enum)
-- =====================================================
ALTER TABLE emergency_contacts DROP CONSTRAINT IF EXISTS emergency_contacts_category_check;
ALTER TABLE emergency_contacts ADD CONSTRAINT emergency_contacts_category_check CHECK (char_length(category) > 0);

-- =====================================================
-- restaurant_opening_checklist: completed map lives in sections
-- =====================================================
ALTER TABLE restaurant_opening_checklist ADD COLUMN IF NOT EXISTS completed JSONB DEFAULT '{}'::jsonb;
ALTER TABLE restaurant_opening_checklist ADD COLUMN IF NOT EXISTS checklist_name TEXT DEFAULT 'new_restaurant';

-- =====================================================
-- inhouse_inspections: quarter tracking
-- =====================================================
ALTER TABLE inhouse_inspections ADD COLUMN IF NOT EXISTS quarter TEXT;
ALTER TABLE inhouse_inspections ADD COLUMN IF NOT EXISTS report_file_name TEXT;
ALTER TABLE inhouse_inspections ADD COLUMN IF NOT EXISTS report_data TEXT;

-- =====================================================
-- staff_licenses / marketing / manuals: file_data for base64 uploads
-- =====================================================
ALTER TABLE staff_licenses ADD COLUMN IF NOT EXISTS file_data TEXT;
ALTER TABLE staff_licenses ADD COLUMN IF NOT EXISTS file_size TEXT DEFAULT '';
ALTER TABLE marketing_promotions ADD COLUMN IF NOT EXISTS file_data TEXT;
ALTER TABLE marketing_promotions ADD COLUMN IF NOT EXISTS file_size TEXT DEFAULT '';
ALTER TABLE marketing_promotions ADD COLUMN IF NOT EXISTS material_type TEXT;
ALTER TABLE marketing_promotions ADD COLUMN IF NOT EXISTS size TEXT;
ALTER TABLE marketing_promotions ADD COLUMN IF NOT EXISTS is_store_request BOOLEAN DEFAULT FALSE;
ALTER TABLE marketing_promotions ADD COLUMN IF NOT EXISTS requested_date DATE;
ALTER TABLE print_manuals ADD COLUMN IF NOT EXISTS file_data TEXT;
ALTER TABLE print_manuals ADD COLUMN IF NOT EXISTS file_size TEXT DEFAULT '';

-- file_url was NOT NULL in rbac schema; allow empty for local-only rows if needed
ALTER TABLE staff_licenses ALTER COLUMN file_url SET DEFAULT '';
ALTER TABLE print_manuals ALTER COLUMN file_url SET DEFAULT '';

-- =====================================================
-- Fix corporate RLS so managers can actually insert (auth.uid() may not equal user_id)
-- =====================================================
DROP POLICY IF EXISTS "Corporate can manage corporate_inspections" ON corporate_inspections;
CREATE POLICY "Corporate can manage corporate_inspections" ON corporate_inspections
  FOR ALL USING (
    user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid()
        AND role IN ('corporate', 'manager', 'owner', 'multi_location_owner')
    )
  )
  WITH CHECK (
    user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid()
        AND role IN ('corporate', 'manager', 'owner', 'multi_location_owner')
    )
  );

-- steps_to_do: also allow role-based access for shared protocols
DROP POLICY IF EXISTS "Users can manage steps_to_do" ON steps_to_do;
CREATE POLICY "Users can manage steps_to_do" ON steps_to_do
  FOR ALL USING (
    user_id IS NULL
    OR user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid()
        AND role IN ('corporate', 'manager', 'owner', 'multi_location_owner')
    )
  )
  WITH CHECK (
    user_id IS NULL
    OR user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid()
        AND role IN ('corporate', 'manager', 'owner', 'multi_location_owner')
    )
  );
