-- RBAC & Document Management Schema
-- Run this AFTER the base schema.sql

-- Update profiles with RBAC roles
ALTER TABLE profiles DROP CONSTRAINT IF EXISTS profiles_role_check;
ALTER TABLE profiles ADD CONSTRAINT profiles_role_check CHECK (role IN ('corporate', 'manager', 'supervisor', 'staff', 'designer'));

-- Business documents table
CREATE TABLE IF NOT EXISTS business_documents (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  restaurant_name TEXT NOT NULL,
  doc_type TEXT NOT NULL CHECK (doc_type IN ('health_license', 'insurance', 'business_license', 'food_inspection', 'other')),
  file_name TEXT NOT NULL,
  file_url TEXT NOT NULL,
  file_size INTEGER,
  uploaded_by UUID REFERENCES profiles(id) NOT NULL,
  expiry_date DATE,
  notes TEXT DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Staff health licenses
CREATE TABLE IF NOT EXISTS staff_licenses (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  restaurant_name TEXT NOT NULL,
  staff_name TEXT NOT NULL,
  license_type TEXT NOT NULL CHECK (license_type IN ('food_handler', 'first_aid', 'whmis', 'other')),
  file_name TEXT NOT NULL,
  file_url TEXT NOT NULL,
  issue_date DATE,
  expiry_date DATE,
  notes TEXT DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Marketing promotions (3 months)
CREATE TABLE IF NOT EXISTS marketing_promotions (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  restaurant_name TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  file_name TEXT,
  file_url TEXT,
  month INTEGER NOT NULL CHECK (month BETWEEN 1 AND 12),
  year INTEGER NOT NULL,
  status TEXT DEFAULT 'planned' CHECK (status IN ('planned', 'active', 'completed')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- In-house inspection checklist
CREATE TABLE IF NOT EXISTS inhouse_inspections (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  restaurant_name TEXT NOT NULL,
  inspection_date DATE NOT NULL,
  inspector_name TEXT NOT NULL,
  sections JSONB NOT NULL DEFAULT '[]',
  overall_score INTEGER,
  max_score INTEGER,
  notes TEXT DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Corporate inspection checklist with ratings
CREATE TABLE IF NOT EXISTS corporate_inspections (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  restaurant_name TEXT NOT NULL,
  inspection_date DATE NOT NULL,
  inspector_name TEXT NOT NULL,
  inspector_role TEXT NOT NULL,
  sections JSONB NOT NULL DEFAULT '[]',
  overall_score INTEGER,
  max_score INTEGER,
  rating TEXT CHECK (rating IN ('excellent', 'good', 'satisfactory', 'needs_improvement', 'critical')),
  strengths TEXT,
  improvements TEXT,
  action_items JSONB DEFAULT '[]',
  signed_off BOOLEAN DEFAULT FALSE,
  signed_off_at TIMESTAMPTZ,
  notes TEXT DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Manuals for print
CREATE TABLE IF NOT EXISTS print_manuals (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  restaurant_name TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  file_name TEXT NOT NULL,
  file_url TEXT NOT NULL,
  category TEXT DEFAULT 'general' CHECK (category IN ('general', 'safety', 'operations', 'training', 'other')),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE business_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE staff_licenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE marketing_promotions ENABLE ROW LEVEL SECURITY;
ALTER TABLE inhouse_inspections ENABLE ROW LEVEL SECURITY;
ALTER TABLE corporate_inspections ENABLE ROW LEVEL SECURITY;
ALTER TABLE print_manuals ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Corporate and managers can view business_documents" ON business_documents
  FOR SELECT USING (
    user_id = auth.uid() OR
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('corporate', 'manager'))
  );
CREATE POLICY "Managers can insert business_documents" ON business_documents
  FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('corporate', 'manager'))
  );
CREATE POLICY "Managers can delete business_documents" ON business_documents
  FOR DELETE USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('corporate', 'manager'))
  );

CREATE POLICY "Managers can view staff_licenses" ON staff_licenses
  FOR SELECT USING (
    user_id = auth.uid() OR
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('corporate', 'manager', 'supervisor'))
  );
CREATE POLICY "Staff can insert own licenses" ON staff_licenses
  FOR INSERT WITH CHECK (user_id = auth.uid());
CREATE POLICY "Managers can delete staff_licenses" ON staff_licenses
  FOR DELETE USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('corporate', 'manager'))
  );

CREATE POLICY "Managers can manage marketing_promotions" ON marketing_promotions
  FOR ALL USING (
    user_id = auth.uid() OR
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('corporate', 'manager', 'designer'))
  );

CREATE POLICY "All staff can view inhouse_inspections" ON inhouse_inspections
  FOR SELECT USING (
    user_id = auth.uid() OR
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND restaurant_name = (SELECT restaurant_name FROM profiles WHERE id = user_id))
  );
CREATE POLICY "Supervisors can insert inhouse_inspections" ON inhouse_inspections
  FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('corporate', 'manager', 'supervisor'))
  );

CREATE POLICY "Corporate can manage corporate_inspections" ON corporate_inspections
  FOR ALL USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('corporate', 'manager'))
  );

CREATE POLICY "All staff can view print_manuals" ON print_manuals
  FOR SELECT USING (
    user_id = auth.uid() OR
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('corporate', 'manager'))
  );
CREATE POLICY "Managers can manage print_manuals" ON print_manuals
  FOR ALL USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('corporate', 'manager'))
  );

-- Indexes
CREATE INDEX idx_business_documents_user_id ON business_documents(user_id);
CREATE INDEX idx_business_documents_doc_type ON business_documents(doc_type);
CREATE INDEX idx_staff_licenses_user_id ON staff_licenses(user_id);
CREATE INDEX idx_marketing_promotions_user_id ON marketing_promotions(user_id);
CREATE INDEX idx_inhouse_inspections_user_id ON inhouse_inspections(user_id);
CREATE INDEX idx_corporate_inspections_user_id ON corporate_inspections(user_id);
CREATE INDEX idx_print_manuals_user_id ON print_manuals(user_id);
