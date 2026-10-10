-- Branding attachments + contact email — a file pinned to the request plus who
-- to reply to. Run AFTER supabase/schema-branding-requests.sql.
-- Idempotent: safe to re-run.
ALTER TABLE branding_requests ADD COLUMN IF NOT EXISTS contact_email TEXT;
ALTER TABLE branding_requests ADD COLUMN IF NOT EXISTS file_url TEXT;
ALTER TABLE branding_requests ADD COLUMN IF NOT EXISTS file_name TEXT;
