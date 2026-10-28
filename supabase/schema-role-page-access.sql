CREATE TABLE IF NOT EXISTS role_page_access (
  role TEXT NOT NULL,
  page TEXT NOT NULL,
  allowed BOOLEAN NOT NULL DEFAULT true,
  PRIMARY KEY (role, page)
);
ALTER TABLE role_page_access ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "rpa_public_all" ON role_page_access;
CREATE POLICY "rpa_public_all" ON role_page_access FOR ALL USING (true) WITH CHECK (true);
