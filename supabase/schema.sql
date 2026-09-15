-- FoodSafe Database Schema
-- Run this in Supabase SQL Editor

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Profiles table
CREATE TABLE IF NOT EXISTS profiles (
  id UUID REFERENCES auth.users(id) ON DELETE CASCADE PRIMARY KEY,
  email TEXT NOT NULL,
  full_name TEXT NOT NULL,
  restaurant_name TEXT NOT NULL,
  role TEXT DEFAULT 'owner' CHECK (role IN ('owner', 'manager', 'staff')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Equipment table
CREATE TABLE IF NOT EXISTS equipment (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  restaurant_name TEXT NOT NULL,
  name TEXT NOT NULL,
  type TEXT NOT NULL,
  min_safe_temp DECIMAL(5,2) NOT NULL,
  max_safe_temp DECIMAL(5,2) NOT NULL,
  location TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Temperature records table
CREATE TABLE IF NOT EXISTS temperature_records (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  restaurant_name TEXT NOT NULL,
  equipment_name TEXT NOT NULL,
  record_type TEXT NOT NULL CHECK (record_type IN ('cooking', 'cooling', 'cold_storage', 'hot_holding', 'reheating', 'probe_calibration')),
  food_item TEXT NOT NULL,
  temperature DECIMAL(5,2) NOT NULL,
  unit TEXT DEFAULT 'C',
  min_safe_temp DECIMAL(5,2) NOT NULL,
  max_safe_temp DECIMAL(5,2) NOT NULL,
  is_safe BOOLEAN NOT NULL,
  notes TEXT DEFAULT '',
  recorded_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Daily checks table
CREATE TABLE IF NOT EXISTS daily_checks (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  restaurant_name TEXT NOT NULL,
  check_type TEXT NOT NULL CHECK (check_type IN ('opening', 'closing')),
  checklist_items JSONB NOT NULL DEFAULT '[]',
  completed BOOLEAN DEFAULT FALSE,
  completed_at TIMESTAMPTZ,
  notes TEXT DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Cleaning records table
CREATE TABLE IF NOT EXISTS cleaning_records (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  restaurant_name TEXT NOT NULL,
  task_name TEXT NOT NULL,
  area TEXT NOT NULL,
  frequency TEXT NOT NULL CHECK (frequency IN ('daily', 'weekly', 'monthly')),
  completed BOOLEAN DEFAULT FALSE,
  completed_at TIMESTAMPTZ,
  notes TEXT DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Allergen records table
CREATE TABLE IF NOT EXISTS allergen_records (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  restaurant_name TEXT NOT NULL,
  menu_item TEXT NOT NULL,
  allergens TEXT[] NOT NULL DEFAULT '{}',
  notes TEXT DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Delivery records table
CREATE TABLE IF NOT EXISTS delivery_records (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  restaurant_name TEXT NOT NULL,
  supplier_name TEXT NOT NULL,
  delivery_date DATE NOT NULL,
  items JSONB NOT NULL DEFAULT '[]',
  temperature DECIMAL(5,2),
  is_accepted BOOLEAN NOT NULL DEFAULT TRUE,
  rejection_reason TEXT DEFAULT '',
  notes TEXT DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Corrective actions table
CREATE TABLE IF NOT EXISTS corrective_actions (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  restaurant_name TEXT NOT NULL,
  issue_description TEXT NOT NULL,
  severity TEXT NOT NULL CHECK (severity IN ('low', 'medium', 'high', 'critical')),
  action_taken TEXT NOT NULL,
  resolved BOOLEAN DEFAULT FALSE,
  resolved_at TIMESTAMPTZ,
  notes TEXT DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Pest control table
CREATE TABLE IF NOT EXISTS pest_control (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  restaurant_name TEXT NOT NULL,
  inspection_date DATE NOT NULL,
  findings TEXT NOT NULL,
  action_taken TEXT NOT NULL,
  next_inspection_date DATE NOT NULL,
  notes TEXT DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Training records table
CREATE TABLE IF NOT EXISTS training_records (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  restaurant_name TEXT NOT NULL,
  staff_name TEXT NOT NULL,
  training_topic TEXT NOT NULL,
  training_date DATE NOT NULL,
  expiry_date DATE NOT NULL,
  certificate_url TEXT,
  notes TEXT DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Row Level Security (RLS)
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE equipment ENABLE ROW LEVEL SECURITY;
ALTER TABLE temperature_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE daily_checks ENABLE ROW LEVEL SECURITY;
ALTER TABLE cleaning_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE allergen_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE delivery_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE corrective_actions ENABLE ROW LEVEL SECURITY;
ALTER TABLE pest_control ENABLE ROW LEVEL SECURITY;
ALTER TABLE training_records ENABLE ROW LEVEL SECURITY;

-- RLS Policies - Users can only see their own data
CREATE POLICY "Users can view own profile" ON profiles FOR SELECT USING (auth.uid() = id);
CREATE POLICY "Users can update own profile" ON profiles FOR UPDATE USING (auth.uid() = id);

CREATE POLICY "Users can view own equipment" ON equipment FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own equipment" ON equipment FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own equipment" ON equipment FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own equipment" ON equipment FOR DELETE USING (auth.uid() = user_id);

CREATE POLICY "Users can view own temperature_records" ON temperature_records FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own temperature_records" ON temperature_records FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own temperature_records" ON temperature_records FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own temperature_records" ON temperature_records FOR DELETE USING (auth.uid() = user_id);

CREATE POLICY "Users can view own daily_checks" ON daily_checks FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own daily_checks" ON daily_checks FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own daily_checks" ON daily_checks FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own daily_checks" ON daily_checks FOR DELETE USING (auth.uid() = user_id);

CREATE POLICY "Users can view own cleaning_records" ON cleaning_records FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own cleaning_records" ON cleaning_records FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own cleaning_records" ON cleaning_records FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own cleaning_records" ON cleaning_records FOR DELETE USING (auth.uid() = user_id);

CREATE POLICY "Users can view own allergen_records" ON allergen_records FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own allergen_records" ON allergen_records FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own allergen_records" ON allergen_records FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own allergen_records" ON allergen_records FOR DELETE USING (auth.uid() = user_id);

CREATE POLICY "Users can view own delivery_records" ON delivery_records FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own delivery_records" ON delivery_records FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own delivery_records" ON delivery_records FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own delivery_records" ON delivery_records FOR DELETE USING (auth.uid() = user_id);

CREATE POLICY "Users can view own corrective_actions" ON corrective_actions FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own corrective_actions" ON corrective_actions FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own corrective_actions" ON corrective_actions FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own corrective_actions" ON corrective_actions FOR DELETE USING (auth.uid() = user_id);

CREATE POLICY "Users can view own pest_control" ON pest_control FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own pest_control" ON pest_control FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own pest_control" ON pest_control FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own pest_control" ON pest_control FOR DELETE USING (auth.uid() = user_id);

CREATE POLICY "Users can view own training_records" ON training_records FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own training_records" ON training_records FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own training_records" ON training_records FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own training_records" ON training_records FOR DELETE USING (auth.uid() = user_id);

-- Indexes for better performance
CREATE INDEX idx_temperature_records_user_id ON temperature_records(user_id);
CREATE INDEX idx_temperature_records_recorded_at ON temperature_records(recorded_at);
CREATE INDEX idx_temperature_records_record_type ON temperature_records(record_type);
CREATE INDEX idx_daily_checks_user_id ON daily_checks(user_id);
CREATE INDEX idx_daily_checks_created_at ON daily_checks(created_at);
CREATE INDEX idx_cleaning_records_user_id ON cleaning_records(user_id);
CREATE INDEX idx_allergen_records_user_id ON allergen_records(user_id);
CREATE INDEX idx_delivery_records_user_id ON delivery_records(user_id);
CREATE INDEX idx_corrective_actions_user_id ON corrective_actions(user_id);
CREATE INDEX idx_pest_control_user_id ON pest_control(user_id);
CREATE INDEX idx_training_records_user_id ON training_records(user_id);
