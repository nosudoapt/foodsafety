-- Release 12, step 55: month-end inventory becomes per-branch.
--
-- Every existing row was written before branches existed (location_id IS NULL).
-- Those rows are Drumheller's real history, so they are assigned to Drumheller
-- rather than deleted. After this, no inventory table holds an unowned row: every
-- read filters by the signed-in branch and every write is stamped by the server,
-- so two branches can never share a month, an item list or a snapshot.
BEGIN;

DO $$
DECLARE
  drum uuid;
  affected bigint;
  tables text[] := ARRAY[
    'inventory_items', 'inventory_counts', 'inventory_purchases',
    'inventory_month_summary', 'inventory_month_snapshots', 'inventory_audit_log'
  ];
  name text;
BEGIN
  SELECT id INTO drum FROM public.locations WHERE slug = 'drumheller' ORDER BY created_at LIMIT 1;
  IF drum IS NULL THEN
    SELECT id INTO drum FROM public.locations ORDER BY created_at LIMIT 1;
  END IF;
  IF drum IS NULL THEN
    RAISE EXCEPTION 'no location exists to receive the legacy inventory rows';
  END IF;

  -- One legacy code was used twice. btb_inventory_code is unique per branch, so
  -- disambiguate the repeat (keeping both items) before the rows become owned.
  WITH ranked AS (
    SELECT id, row_number() OVER (PARTITION BY source, lower(btrim(item_number)) ORDER BY created_at, id) AS rn
    FROM public.inventory_items WHERE item_number IS NOT NULL
  )
  UPDATE public.inventory_items item
    SET item_number = item.item_number || '-' || ranked.rn
    FROM ranked WHERE ranked.id = item.id AND ranked.rn > 1;

  FOREACH name IN ARRAY tables LOOP
    EXECUTE format('UPDATE public.%I SET location_id = $1 WHERE location_id IS NULL', name) USING drum;
    GET DIAGNOSTICS affected = ROW_COUNT;
    RAISE NOTICE 'backfilled % rows in %', affected, name;
  END LOOP;

  -- Snapshots were keyed by a placeholder scope; the branch is now the scope, so
  -- two branches can close the same month independently.
  UPDATE public.inventory_month_snapshots
    SET scope_key = location_id::text
    WHERE scope_key = 'legacy' AND location_id IS NOT NULL;
END $$;

ALTER TABLE public.inventory_purchase_lines
  ADD COLUMN IF NOT EXISTS location_id uuid REFERENCES public.locations(id);

UPDATE public.inventory_purchase_lines line
  SET location_id = purchase.location_id
  FROM public.inventory_purchases purchase
  WHERE line.location_id IS NULL AND purchase.id = line.purchase_id;

CREATE INDEX IF NOT EXISTS inventory_items_location ON public.inventory_items(location_id, position);
CREATE INDEX IF NOT EXISTS inventory_counts_location ON public.inventory_counts(location_id, count_month);
CREATE INDEX IF NOT EXISTS inventory_purchases_location ON public.inventory_purchases(location_id, count_month);
CREATE INDEX IF NOT EXISTS inventory_summary_location ON public.inventory_month_summary(location_id, count_month);
CREATE INDEX IF NOT EXISTS inventory_snapshots_location ON public.inventory_month_snapshots(location_id, count_month);
CREATE INDEX IF NOT EXISTS inventory_audit_location ON public.inventory_audit_log(location_id, count_month);
CREATE INDEX IF NOT EXISTS inventory_purchase_lines_location ON public.inventory_purchase_lines(location_id);

DROP INDEX IF EXISTS public.uniq_gfs_invoice;
CREATE UNIQUE INDEX IF NOT EXISTS inventory_purchases_branch_reference
  ON public.inventory_purchases(location_id, type, upper(btrim(supplier)), upper(btrim(reference)))
  WHERE location_id IS NOT NULL AND reference IS NOT NULL AND btrim(reference) <> '' AND voided_at IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS inventory_snapshots_branch_month
  ON public.inventory_month_snapshots(location_id, count_month)
  WHERE location_id IS NOT NULL;

DO $$ BEGIN
  CREATE UNIQUE INDEX IF NOT EXISTS inventory_items_branch_name
    ON public.inventory_items(location_id, lower(btrim(name)))
    WHERE location_id IS NOT NULL;
EXCEPTION WHEN unique_violation THEN
  RAISE NOTICE 'duplicate item names exist; per-branch name uniqueness not enforced';
END $$;

DO $$ BEGIN
  CREATE UNIQUE INDEX IF NOT EXISTS inventory_counts_branch_item_month
    ON public.inventory_counts(location_id, count_month, item_id)
    WHERE location_id IS NOT NULL;
EXCEPTION WHEN unique_violation THEN
  RAISE NOTICE 'duplicate counts exist; per-branch count uniqueness not enforced';
END $$;

-- A new branch starts with an empty list and can clone the starter items inside
-- its own branch without touching anyone else's rows.
CREATE OR REPLACE FUNCTION public.btb_inventory_seed_items(p_location uuid, p_source uuid DEFAULT NULL)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  inserted integer := 0;
BEGIN
  IF p_location IS NULL THEN RAISE EXCEPTION 'a branch is required'; END IF;
  IF EXISTS (SELECT 1 FROM public.inventory_items WHERE location_id = p_location) THEN
    RETURN 0;
  END IF;
  IF p_source IS NULL THEN
    SELECT id INTO p_source FROM public.locations WHERE slug = 'drumheller' LIMIT 1;
  END IF;
  IF p_source IS NULL OR NOT EXISTS (SELECT 1 FROM public.inventory_items WHERE location_id = p_source) THEN
    RETURN 0;
  END IF;
  INSERT INTO public.inventory_items
    (location_id, name, unit, category, unit_cost, "position", item_number, source, unit_size, pack_size, case_price, packet_price, par_value, protected)
  SELECT p_location, name, unit, category, unit_cost, "position", item_number, source, unit_size, pack_size, case_price, packet_price, par_value, protected
  FROM public.inventory_items WHERE location_id = p_source ORDER BY "position";
  GET DIAGNOSTICS inserted = ROW_COUNT;
  RETURN inserted;
END $$;

REVOKE ALL ON FUNCTION public.btb_inventory_seed_items(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.btb_inventory_seed_items(uuid, uuid) TO service_role;

NOTIFY pgrst, 'reload schema';
COMMIT;
