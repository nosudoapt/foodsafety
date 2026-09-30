-- Compliance, vault, emergency, handbook & operational tables.
-- Run AFTER schema.sql, schema-rbac.sql, schema-roles.sql, schema-features.sql.
-- These are ADMIN/back-of-house tables: guarded by auth + RBAC, not public.

-- Unified compliance register — every expiring document in one place.
-- doc_type drives the notify lead-time in the app (src/lib/expiry.ts).
CREATE TABLE IF NOT EXISTS compliance_documents (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  restaurant_name TEXT NOT NULL DEFAULT 'Between the Buns',
  doc_type TEXT NOT NULL,
  name TEXT NOT NULL,
  file_name TEXT,
  file_url TEXT,
  issue_date DATE,
  expiry_date DATE,
  notes TEXT DEFAULT '',
  uploaded_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Login vault: POS, banking, delivery-app, utility credentials. Sensitive.
CREATE TABLE IF NOT EXISTS login_vault (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  restaurant_name TEXT NOT NULL DEFAULT 'Between the Buns',
  service TEXT NOT NULL,
  category TEXT DEFAULT 'other' CHECK (category IN ('pos','banking','delivery','utility','supplier','other')),
  username TEXT,
  secret TEXT,           -- AES-256-GCM ciphertext written by src/lib/vault-crypto.ts
  url TEXT,
  notes TEXT DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Emergency contacts. rank 1 = primary; kind separates people vs services.
CREATE TABLE IF NOT EXISTS emergency_contacts (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  restaurant_name TEXT NOT NULL DEFAULT 'Between the Buns',
  name TEXT NOT NULL,
  role TEXT,
  phone TEXT NOT NULL,
  kind TEXT DEFAULT 'person' CHECK (kind IN ('person','service')),
  rank INTEGER NOT NULL DEFAULT 1,
  notes TEXT DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Employee handbook + digital acknowledgement signatures.
CREATE TABLE IF NOT EXISTS handbook_documents (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  restaurant_name TEXT NOT NULL DEFAULT 'Between the Buns',
  title TEXT NOT NULL,
  version TEXT DEFAULT '1.0',
  file_url TEXT,
  body TEXT,             -- inline handbook text for read-in-app
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS handbook_signatures (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  handbook_id UUID REFERENCES handbook_documents(id) ON DELETE CASCADE,
  staff_name TEXT NOT NULL,
  signature TEXT NOT NULL,   -- typed full name = acknowledgement
  signed_at TIMESTAMPTZ DEFAULT NOW()
);

-- "Steps to do" operational protocols (power out, no internet, debit down, phone).
CREATE TABLE IF NOT EXISTS operational_protocols (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  restaurant_name TEXT NOT NULL DEFAULT 'Between the Buns',
  title TEXT NOT NULL,
  icon TEXT DEFAULT '⚠️',
  steps JSONB NOT NULL DEFAULT '[]',
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Open-new-restaurant checklist items.
CREATE TABLE IF NOT EXISTS new_restaurant_tasks (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  restaurant_name TEXT NOT NULL DEFAULT 'Between the Buns',
  phase TEXT NOT NULL DEFAULT 'setup',
  task TEXT NOT NULL,
  done BOOLEAN DEFAULT FALSE,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE compliance_documents  ENABLE ROW LEVEL SECURITY;
ALTER TABLE login_vault           ENABLE ROW LEVEL SECURITY;
ALTER TABLE emergency_contacts    ENABLE ROW LEVEL SECURITY;
ALTER TABLE handbook_documents    ENABLE ROW LEVEL SECURITY;
ALTER TABLE handbook_signatures   ENABLE ROW LEVEL SECURITY;
ALTER TABLE operational_protocols ENABLE ROW LEVEL SECURITY;
ALTER TABLE new_restaurant_tasks  ENABLE ROW LEVEL SECURITY;

-- Authenticated access. The vault is owner/manager-tier; the rest are readable
-- by any signed-in staffer. Writes require an admin-tier (management) role.
DO $$
DECLARE t TEXT;
DECLARE mgmt TEXT := $roles$('owner','multi_location_owner','corporate','manager')$roles$;
BEGIN
  FOREACH t IN ARRAY ARRAY['compliance_documents','emergency_contacts','handbook_documents',
                           'handbook_signatures','operational_protocols','new_restaurant_tasks'] LOOP
    EXECUTE format('DROP POLICY IF EXISTS "%s_auth_read" ON %I;', t, t);
    EXECUTE format('CREATE POLICY "%s_auth_read" ON %I FOR SELECT USING (auth.uid() IS NOT NULL);', t, t);
    EXECUTE format('DROP POLICY IF EXISTS "%s_auth_write" ON %I;', t, t);
    EXECUTE format('DROP POLICY IF EXISTS "%s_mgmt_write" ON %I;', t, t);
    EXECUTE format(
      'CREATE POLICY "%s_mgmt_write" ON %I FOR ALL '
      || 'USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN %s)) '
      || 'WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN %s));',
      t, t, mgmt, mgmt);
  END LOOP;
END $$;

-- Vault: owner-tier only (mirrors src/lib/roles.ts OWNER_TIER_ROLES, the
-- /admin/vault nav tier and the server-side gate in proxy.ts). Secrets are
-- encrypted at rest by the app (src/lib/vault-crypto.ts); never select them
-- from the browser.
DROP POLICY IF EXISTS "login_vault_admin" ON login_vault;
DROP POLICY IF EXISTS "login_vault_owner" ON login_vault;
CREATE POLICY "login_vault_owner" ON login_vault FOR ALL
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid()
                 AND role IN ('owner','multi_location_owner','corporate')))
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid()
                 AND role IN ('owner','multi_location_owner','corporate')));

CREATE INDEX IF NOT EXISTS idx_compliance_expiry ON compliance_documents(expiry_date);
CREATE INDEX IF NOT EXISTS idx_emergency_rank ON emergency_contacts(rank);
