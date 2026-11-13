-- 13 Nov 2026 updates: branding combo requests, optional shift duties,
-- per-document compliance reminders. Run once on an existing database.
-- Fresh installs get the same shapes from their base schema files.

-- 1) Branding requests: quantities + combo requests. One request filed by a
--    location may carry several item lines (`items`) with capped quantities.
ALTER TABLE branding_requests ADD COLUMN IF NOT EXISTS qty INTEGER;
ALTER TABLE branding_requests ADD COLUMN IF NOT EXISTS items JSONB;

-- 2) Staff schedule: duties are optional and "prep" is a duty.
ALTER TABLE btb_shifts DROP CONSTRAINT IF EXISTS btb_shifts_duty_check;
ALTER TABLE btb_shifts ADD CONSTRAINT btb_shifts_duty_check
  CHECK (duty IN ('opening','service','closing','both','prep','none'));

-- 3) Compliance register: per-document reminder toggle, driven by the bell
--    button beside the expiry date entry in the renewal form.
ALTER TABLE compliance_documents ADD COLUMN IF NOT EXISTS notify BOOLEAN DEFAULT TRUE;

NOTIFY pgrst,'reload schema';
