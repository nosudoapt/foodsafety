-- Step 31: Compliance renewals get a SECOND attachment slot. The first
-- (file_name / file_url) stays the renewal certificate itself; the new pair
-- holds an "other" supporting document (receipt, inspection report, photo…).
ALTER TABLE public.compliance_documents
  ADD COLUMN IF NOT EXISTS other_file_name TEXT,
  ADD COLUMN IF NOT EXISTS other_file_url TEXT;
