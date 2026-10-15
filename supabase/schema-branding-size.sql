-- Branding size detail — uniform S/M/L or tray Small/Large.
-- Run AFTER supabase/schema-branding-requests.sql. Idempotent: safe to re-run.
ALTER TABLE branding_requests ADD COLUMN IF NOT EXISTS size TEXT;
