-- Comprehensive Schema for Between the Buns
-- Run AFTER schema.sql and schema-rbac.sql

-- =====================================================
-- EXISTING TABLES - Enhanced
-- =====================================================

-- Enhance profiles with new roles
ALTER TABLE profiles DROP CONSTRAINT IF EXISTS profiles_role_check;
ALTER TABLE profiles ADD CONSTRAINT profiles_role_check CHECK (role IN ('corporate', 'multi_location_owner', 'manager', 'owner', 'supervisor', 'staff', 'designer'));

-- =====================================================
-- DAILY PREP COUNT SHEET (3-month records)
-- =====================================================
CREATE TABLE IF NOT EXISTS daily_prep_counts (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  restaurant_name TEXT NOT NULL,
  prep_date DATE NOT NULL,
  item_name TEXT NOT NULL,
  par NUMERIC,
  on_hand NUMERIC,
  make NUMERIC GENERATED ALWAYS AS (GREATEST(COALESCE(par,0) - COALESCE(on_hand,0), 0)) STORED,
  initial TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- =====================================================
-- UPLOAD ORDER SHEET (3-month records)
-- =====================================================
CREATE TABLE IF NOT EXISTS order_sheets (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  restaurant_name TEXT NOT NULL,
  order_date DATE NOT NULL,
  item_name TEXT NOT NULL,
  par NUMERIC,
  on_hand NUMERIC,
  order_qty NUMERIC GENERATED ALWAYS AS (GREATEST(COALESCE(par,0) - COALESCE(on_hand,0), 0)) STORED,
  initial TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- =====================================================
-- DOCUMENT MANAGEMENT SYSTEM
-- =====================================================
CREATE TABLE IF NOT EXISTS documents (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  restaurant_name TEXT NOT NULL,
  doc_category TEXT NOT NULL CHECK (doc_category IN (
    'health_license', 'business_license', 'business_insurance',
    'food_inspection', 'pest_control', 'hoods_inspection',
    'fire_suppression', 'franchise_agreement', 'lease_agreement',
    'staff_certificate', 'other'
  )),
  title TEXT NOT NULL,
  description TEXT DEFAULT '',
  file_name TEXT NOT NULL,
  file_data TEXT NOT NULL,
  file_size INTEGER,
  file_type TEXT,
  expiry_date DATE,
  notification_months INTEGER DEFAULT 2,
  uploaded_by UUID REFERENCES profiles(id) NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- =====================================================
-- PEST CONTROL REPORTS (monthly)
-- =====================================================
CREATE TABLE IF NOT EXISTS pest_control_reports (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  restaurant_name TEXT NOT NULL,
  report_month INTEGER NOT NULL CHECK (report_month BETWEEN 1 AND 12),
  report_year INTEGER NOT NULL,
  file_name TEXT NOT NULL,
  file_data TEXT NOT NULL,
  provider TEXT,
  findings TEXT DEFAULT '',
  next_service DATE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- =====================================================
-- MARKETING MATERIAL
-- =====================================================
CREATE TABLE IF NOT EXISTS marketing_materials (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  restaurant_name TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT DEFAULT '',
  material_type TEXT NOT NULL CHECK (material_type IN (
    'poster_24x36', 'poster_8x11', 'banner_8x4', 'banner_5x10',
    'social_media', 'calendar', 'other'
  )),
  file_name TEXT NOT NULL,
  file_data TEXT NOT NULL,
  month INTEGER,
  year INTEGER,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- =====================================================
-- SOCIAL MEDIA CALENDAR
-- =====================================================
CREATE TABLE IF NOT EXISTS social_media_calendar (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  restaurant_name TEXT NOT NULL,
  post_date DATE NOT NULL,
  platform TEXT NOT NULL CHECK (platform IN ('instagram', 'facebook', 'tiktok', 'twitter', 'other')),
  content_title TEXT NOT NULL,
  content_description TEXT,
  file_data TEXT,
  status TEXT DEFAULT 'planned' CHECK (status IN ('planned', 'scheduled', 'posted')),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- =====================================================
-- CORPORATE PROMOTION REQUESTS
-- =====================================================
CREATE TABLE IF NOT EXISTS promotion_requests (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  restaurant_name TEXT NOT NULL,
  request_date DATE NOT NULL,
  promo_month INTEGER NOT NULL,
  promo_year INTEGER NOT NULL,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'denied', 'in_progress')),
  corporate_notes TEXT DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- =====================================================
-- STEPS TO DO (Emergency Procedures)
-- =====================================================
CREATE TABLE IF NOT EXISTS steps_to_do (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  restaurant_name TEXT NOT NULL,
  scenario TEXT NOT NULL CHECK (scenario IN (
    'power_out', 'internet_out', 'debit_machine_out',
    'phone_out', 'water_out', 'gas_leak', 'fire', 'other'
  )),
  steps JSONB NOT NULL DEFAULT '[]',
  last_updated TIMESTAMPTZ DEFAULT NOW(),
  updated_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- =====================================================
-- LOGIN INFORMATION (Encrypted sensitive data)
-- =====================================================
CREATE TABLE IF NOT EXISTS login_information (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  restaurant_name TEXT NOT NULL,
  system_name TEXT NOT NULL,
  username TEXT NOT NULL,
  password_encrypted TEXT NOT NULL,
  notes TEXT DEFAULT '',
  last_updated TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- =====================================================
-- EMERGENCY CONTACTS
-- =====================================================
CREATE TABLE IF NOT EXISTS emergency_contacts (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  restaurant_name TEXT NOT NULL,
  category TEXT NOT NULL CHECK (category IN (
    'electrician', 'plumber', 'handyman', 'hvac',
    'grease_trap', 'pest_control', 'linen', 'internet',
    'security', 'hoods', 'fire_suppression', 'other'
  )),
  company_name TEXT NOT NULL,
  phone_1 TEXT,
  phone_2 TEXT,
  phone_3 TEXT,
  contact_name TEXT DEFAULT '',
  email TEXT DEFAULT '',
  notes TEXT DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- =====================================================
-- TRAINING MODULES
-- =====================================================
CREATE TABLE IF NOT EXISTS training_modules (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  restaurant_name TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT DEFAULT '',
  file_name TEXT NOT NULL,
  file_data TEXT NOT NULL,
  category TEXT DEFAULT 'general',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- =====================================================
-- EMPLOYEE HANDBOOK + DIGITAL SIGNATURES
-- =====================================================
CREATE TABLE IF NOT EXISTS employee_handbooks (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  restaurant_name TEXT NOT NULL,
  title TEXT NOT NULL DEFAULT 'Employee Handbook',
  file_name TEXT NOT NULL,
  file_data TEXT NOT NULL,
  version TEXT DEFAULT '1.0',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS handbook_signatures (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  handbook_id UUID REFERENCES employee_handbooks(id) ON DELETE CASCADE NOT NULL,
  staff_name TEXT NOT NULL,
  staff_email TEXT,
  signed_at TIMESTAMPTZ DEFAULT NOW(),
  ip_address TEXT,
  acknowledged_content TEXT DEFAULT ''
);

-- =====================================================
-- MATERIAL TO PRINT
-- =====================================================
CREATE TABLE IF NOT EXISTS print_materials (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  restaurant_name TEXT NOT NULL,
  title TEXT NOT NULL,
  category TEXT NOT NULL CHECK (category IN (
    'application_form', 'incident_report', 'warning_letter',
    'termination_letter', 'offer_letter', 'policy', 'other'
  )),
  file_name TEXT NOT NULL,
  file_data TEXT NOT NULL,
  description TEXT DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- =====================================================
-- OPEN NEW RESTAURANT CHECKLIST
-- =====================================================
CREATE TABLE IF NOT EXISTS restaurant_opening_checklist (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  restaurant_name TEXT NOT NULL,
  target_open_date DATE,
  sections JSONB NOT NULL DEFAULT '[]',
  status TEXT DEFAULT 'in_progress' CHECK (status IN ('planned', 'in_progress', 'completed')),
  notes TEXT DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- =====================================================
-- QUARTERLY INSPECTION (with link to ratings)
-- =====================================================
CREATE TABLE IF NOT EXISTS quarterly_inspections (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  restaurant_name TEXT NOT NULL,
  quarter INTEGER NOT NULL CHECK (quarter BETWEEN 1 AND 4),
  year INTEGER NOT NULL,
  inspection_link TEXT,
  score INTEGER,
  max_score INTEGER,
  rating TEXT,
  inspector_name TEXT,
  notes TEXT DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- =====================================================
-- RLS POLICIES
-- =====================================================
ALTER TABLE daily_prep_counts ENABLE ROW LEVEL SECURITY;
ALTER TABLE order_sheets ENABLE ROW LEVEL SECURITY;
ALTER TABLE documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE pest_control_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE marketing_materials ENABLE ROW LEVEL SECURITY;
ALTER TABLE social_media_calendar ENABLE ROW LEVEL SECURITY;
ALTER TABLE promotion_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE steps_to_do ENABLE ROW LEVEL SECURITY;
ALTER TABLE login_information ENABLE ROW LEVEL SECURITY;
ALTER TABLE emergency_contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE training_modules ENABLE ROW LEVEL SECURITY;
ALTER TABLE employee_handbooks ENABLE ROW LEVEL SECURITY;
ALTER TABLE handbook_signatures ENABLE ROW LEVEL SECURITY;
ALTER TABLE print_materials ENABLE ROW LEVEL SECURITY;
ALTER TABLE restaurant_opening_checklist ENABLE ROW LEVEL SECURITY;
ALTER TABLE quarterly_inspections ENABLE ROW LEVEL SECURITY;

-- User-based policies
CREATE POLICY "Users can manage daily_prep_counts" ON daily_prep_counts FOR ALL USING (user_id = auth.uid());
CREATE POLICY "Users can manage order_sheets" ON order_sheets FOR ALL USING (user_id = auth.uid());
CREATE POLICY "Users can manage documents" ON documents FOR ALL USING (user_id = auth.uid());
CREATE POLICY "Users can manage pest_control_reports" ON pest_control_reports FOR ALL USING (user_id = auth.uid());
CREATE POLICY "Users can manage marketing_materials" ON marketing_materials FOR ALL USING (user_id = auth.uid());
CREATE POLICY "Users can manage social_media_calendar" ON social_media_calendar FOR ALL USING (user_id = auth.uid());
CREATE POLICY "Users can manage promotion_requests" ON promotion_requests FOR ALL USING (user_id = auth.uid());
CREATE POLICY "Users can manage steps_to_do" ON steps_to_do FOR ALL USING (user_id = auth.uid());
CREATE POLICY "Users can manage login_information" ON login_information FOR ALL USING (user_id = auth.uid());
CREATE POLICY "Users can manage emergency_contacts" ON emergency_contacts FOR ALL USING (user_id = auth.uid());
CREATE POLICY "Users can manage training_modules" ON training_modules FOR ALL USING (user_id = auth.uid());
CREATE POLICY "Users can manage employee_handbooks" ON employee_handbooks FOR ALL USING (user_id = auth.uid());
CREATE POLICY "Users can manage print_materials" ON print_materials FOR ALL USING (user_id = auth.uid());
CREATE POLICY "Users can manage restaurant_opening_checklist" ON restaurant_opening_checklist FOR ALL USING (user_id = auth.uid());
CREATE POLICY "Users can manage quarterly_inspections" ON quarterly_inspections FOR ALL USING (user_id = auth.uid());

CREATE POLICY "Staff can sign handbook" ON handbook_signatures FOR INSERT WITH CHECK (true);
CREATE POLICY "Managers can view signatures" ON handbook_signatures FOR SELECT USING (
  EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('corporate', 'manager', 'owner'))
);

-- =====================================================
-- INDEXES
-- =====================================================
CREATE INDEX idx_daily_prep_counts_date ON daily_prep_counts(prep_date);
CREATE INDEX idx_daily_prep_counts_restaurant ON daily_prep_counts(restaurant_name);
CREATE INDEX idx_order_sheets_date ON order_sheets(order_date);
CREATE INDEX idx_documents_category ON documents(doc_category);
CREATE INDEX idx_documents_expiry ON documents(expiry_date);
CREATE INDEX idx_pest_control_month ON pest_control_reports(report_month, report_year);
CREATE INDEX idx_marketing_month ON marketing_materials(month, year);
CREATE INDEX idx_login_restaurant ON login_information(restaurant_name);
CREATE INDEX idx_emergency_category ON emergency_contacts(category);
CREATE INDEX idx_handbook_signatures ON handbook_signatures(handbook_id);
