-- Release 08: existing inventory ledger + scoped, transactional period close.
BEGIN;
ALTER TABLE inventory_items ADD COLUMN IF NOT EXISTS item_number text;
ALTER TABLE inventory_items ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'local' CHECK(source IN ('gfs','local'));
ALTER TABLE inventory_items ADD COLUMN IF NOT EXISTS unit_size text;
ALTER TABLE inventory_items ADD COLUMN IF NOT EXISTS pack_size numeric(12,4) CHECK(pack_size>0);
ALTER TABLE inventory_items ADD COLUMN IF NOT EXISTS case_price numeric(12,2) CHECK(case_price>=0);
ALTER TABLE inventory_items ADD COLUMN IF NOT EXISTS packet_price numeric(12,4) CHECK(packet_price>=0);
ALTER TABLE inventory_items ADD COLUMN IF NOT EXISTS par_value numeric(12,4);
ALTER TABLE inventory_items ADD COLUMN IF NOT EXISTS source_data jsonb;
CREATE UNIQUE INDEX IF NOT EXISTS btb_inventory_code ON inventory_items(location_id,source,lower(trim(item_number))) WHERE item_number IS NOT NULL AND location_id IS NOT NULL;
ALTER TABLE inventory_counts ADD COLUMN IF NOT EXISTS cases numeric(12,4) CHECK(cases>=0);
ALTER TABLE inventory_counts ADD COLUMN IF NOT EXISTS packets numeric(12,4) CHECK(packets>=0);
ALTER TABLE inventory_counts ADD COLUMN IF NOT EXISTS case_price_at_count numeric(12,2);
ALTER TABLE inventory_counts ADD COLUMN IF NOT EXISTS packet_price_at_count numeric(12,4);
ALTER TABLE inventory_counts ADD COLUMN IF NOT EXISTS line_value numeric(14,2);
ALTER TABLE inventory_purchases ADD COLUMN IF NOT EXISTS location_id uuid REFERENCES locations(id);
ALTER TABLE inventory_purchases ADD COLUMN IF NOT EXISTS document_id uuid;
ALTER TABLE inventory_purchases ADD COLUMN IF NOT EXISTS voided_at timestamptz;
DROP INDEX IF EXISTS uniq_gfs_invoice;
CREATE UNIQUE INDEX IF NOT EXISTS uniq_gfs_invoice ON inventory_purchases(type,supplier,reference) WHERE type='gfs' AND reference IS NOT NULL AND location_id IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS btb_purchase_reference ON inventory_purchases(location_id,type,lower(trim(supplier)),lower(trim(reference))) WHERE location_id IS NOT NULL AND reference IS NOT NULL AND trim(reference)<>'' AND voided_at IS NULL;
ALTER TABLE inventory_month_summary ADD COLUMN IF NOT EXISTS opening_confirmed boolean NOT NULL DEFAULT false;
ALTER TABLE inventory_month_summary ADD COLUMN IF NOT EXISTS opening_reason text;
ALTER TABLE inventory_month_summary ADD COLUMN IF NOT EXISTS purchases_confirmed boolean NOT NULL DEFAULT false;
ALTER TABLE inventory_month_summary ADD COLUMN IF NOT EXISTS sales_confirmed boolean NOT NULL DEFAULT false;
ALTER TABLE inventory_month_summary ADD COLUMN IF NOT EXISTS sales_basis text;
ALTER TABLE inventory_month_summary ADD COLUMN IF NOT EXISTS sales_figures jsonb;
ALTER TABLE inventory_month_summary ADD COLUMN IF NOT EXISTS sales_document_id uuid;
ALTER TABLE inventory_month_summary ADD COLUMN IF NOT EXISTS version integer NOT NULL DEFAULT 1;
ALTER TABLE inventory_month_snapshots ADD COLUMN IF NOT EXISTS location_id uuid REFERENCES locations(id);
ALTER TABLE inventory_month_snapshots ADD COLUMN IF NOT EXISTS scope_key text NOT NULL DEFAULT 'legacy';
ALTER TABLE inventory_month_snapshots ADD COLUMN IF NOT EXISTS id uuid NOT NULL DEFAULT gen_random_uuid();
ALTER TABLE inventory_month_snapshots ADD COLUMN IF NOT EXISTS item_snapshot jsonb;
ALTER TABLE inventory_month_snapshots ADD COLUMN IF NOT EXISTS gfs_purchases numeric(14,2);
ALTER TABLE inventory_month_snapshots ADD COLUMN IF NOT EXISTS local_purchases numeric(14,2);
ALTER TABLE inventory_month_snapshots ADD COLUMN IF NOT EXISTS sales_basis text;
ALTER TABLE inventory_month_snapshots DROP CONSTRAINT IF EXISTS inventory_month_snapshots_pkey;
ALTER TABLE inventory_month_snapshots ADD CONSTRAINT inventory_month_snapshots_pkey PRIMARY KEY(count_month,scope_key);
ALTER TABLE inventory_audit_log ADD COLUMN IF NOT EXISTS location_id uuid REFERENCES locations(id);

CREATE TABLE IF NOT EXISTS btb_document_imports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), location_id uuid NOT NULL REFERENCES btb_location_settings(location_id),
  file_id uuid NOT NULL REFERENCES btb_file_objects(id), kind text NOT NULL CHECK(kind IN ('gfs','local','sales','master')),
  sha256 text NOT NULL, raw_text text NOT NULL DEFAULT '', extracted_data jsonb NOT NULL DEFAULT '{}',
  review_data jsonb, status text NOT NULL DEFAULT 'review' CHECK(status IN ('review','confirmed','rejected')),
  extractor text NOT NULL, extraction_error text, confirmed_record_id uuid,
  accounting_month text NOT NULL CHECK(accounting_month ~ '^\d{4}-(0[1-9]|1[0-2])$'),
  created_by uuid NOT NULL REFERENCES btb_employees(id), confirmed_by uuid REFERENCES btb_employees(id),
  created_at timestamptz NOT NULL DEFAULT now(), confirmed_at timestamptz,
  UNIQUE(location_id,kind,sha256)
);
CREATE TABLE IF NOT EXISTS inventory_purchase_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), purchase_id uuid NOT NULL REFERENCES inventory_purchases(id),
  item_id uuid REFERENCES inventory_items(id), description text NOT NULL, item_code text,
  cases numeric(12,4) NOT NULL DEFAULT 0 CHECK(cases>=0), packets numeric(12,4) NOT NULL DEFAULT 0 CHECK(packets>=0),
  unit_price numeric(12,4), line_total numeric(14,2), source_line jsonb NOT NULL
);

CREATE OR REPLACE FUNCTION btb_platform_import(p_actor uuid,p_session integer,p_location uuid,p_file uuid,p_kind text,p_month text,p_text text,p_extracted jsonb,p_extractor text,p_error text)
RETURNS jsonb LANGUAGE plpgsql SET search_path=public AS $$
DECLARE actor btb_employees; file btb_file_objects; saved btb_document_imports;
BEGIN
  actor:=btb_platform_assert(p_actor,p_session,p_location,CASE WHEN p_kind='local' THEN 'purchase.upload' ELSE 'inventory.write' END);
  SELECT * INTO file FROM btb_file_objects WHERE id=p_file AND location_id=p_location AND owner_id=p_actor;
  IF NOT FOUND OR file.purpose<>(CASE WHEN p_kind='sales' THEN 'sales' ELSE 'purchase' END) THEN RAISE EXCEPTION 'Invalid source file' USING ERRCODE='42501'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('inventory:'||p_location,0));
  IF EXISTS(SELECT 1 FROM inventory_month_snapshots WHERE location_id=p_location AND count_month=p_month AND status='finalized') THEN RAISE EXCEPTION 'Month is finalized; reopen first' USING ERRCODE='40001'; END IF;
  INSERT INTO btb_document_imports(location_id,file_id,kind,sha256,accounting_month,raw_text,extracted_data,extractor,extraction_error,created_by)
  VALUES(p_location,p_file,p_kind,file.sha256,p_month,p_text,p_extracted,p_extractor,p_error,p_actor) RETURNING * INTO saved;
  PERFORM btb_event(p_location,'import',saved.id,'extract',p_actor,NULL,to_jsonb(saved)-'raw_text');
  PERFORM btb_notify(p_location,ARRAY['manager'],'review:'||saved.id,'Purchase or sales document needs review','Review extracted values before confirming the ledger.','/between-the-buns/platform?module=inventory',NULL,false);
  RETURN to_jsonb(saved);
END $$;

CREATE OR REPLACE FUNCTION btb_platform_inventory(p_actor uuid,p_session integer,p_location uuid,p_month text,p_action text,p_data jsonb)
RETURNS jsonb LANGUAGE plpgsql SET search_path=public AS $$
DECLARE actor btb_employees; summary inventory_month_summary; previous inventory_month_snapshots; snapshot inventory_month_snapshots;
  old_snapshot inventory_month_snapshots; item inventory_items; doc btb_document_imports; line jsonb; saved_id uuid; period date;
  opening numeric; closing numeric; gfs numeric; local_total numeric; purchases_total numeric; v_sales numeric; cogs numeric; pct numeric;
  figures jsonb; lines jsonb; v_amount numeric; basis text; reason text; vendor text; v_reference text; event_id uuid;
BEGIN
  actor:=btb_platform_assert(p_actor,p_session,p_location,'inventory.write');
  IF p_month !~ '^\d{4}-(0[1-9]|1[0-2])$' THEN RAISE EXCEPTION 'Invalid accounting month'; END IF;
  period:=(p_month||'-01')::date;
  -- All financial writes for a location share one lock: imports, counts, close,
  -- reopen and catalog edits cannot race across adjacent accounting months.
  PERFORM pg_advisory_xact_lock(hashtextextended('inventory:'||p_location,0));
  SELECT * INTO snapshot FROM inventory_month_snapshots WHERE location_id=p_location AND count_month=p_month FOR UPDATE;
  IF snapshot.status='finalized' AND p_action<>'reopen' THEN RAISE EXCEPTION 'Month is finalized; reopen first' USING ERRCODE='40001'; END IF;
  SELECT * INTO summary FROM inventory_month_summary WHERE location_id=p_location AND count_month=p_month FOR UPDATE;
  SELECT * INTO previous FROM inventory_month_snapshots WHERE location_id=p_location AND count_month=to_char(period-interval '1 month','YYYY-MM');
  IF p_action IN ('items','confirm_master') THEN
    IF p_action='confirm_master' THEN
      SELECT * INTO doc FROM btb_document_imports WHERE id=(p_data->>'import_id')::uuid AND location_id=p_location AND kind='master' AND accounting_month=p_month FOR UPDATE;
      IF NOT FOUND OR doc.status<>'review' THEN RAISE EXCEPTION 'Master import already confirmed or unavailable' USING ERRCODE='40001'; END IF;
    END IF;
    IF coalesce((p_data->>'review_confirmed')::boolean,false)=false OR jsonb_array_length(p_data->'items') NOT BETWEEN 1 AND 2000 THEN RAISE EXCEPTION 'Review the catalog rows before confirming'; END IF;
    FOR line IN SELECT * FROM jsonb_array_elements(p_data->'items') LOOP
      IF coalesce(trim(line->>'name'),'')='' OR coalesce(trim(line->>'item_number'),'')='' THEN RAISE EXCEPTION 'Item number and description required'; END IF;
      IF (line->>'pack_size') IS NULL OR (line->>'pack_size')::numeric<=0 OR (line->>'case_price') IS NULL OR (line->>'packet_price') IS NULL THEN RAISE EXCEPTION 'Explicit pack size and case/packet prices required'; END IF;
      SELECT * INTO item FROM inventory_items WHERE location_id=p_location AND source=line->>'source' AND lower(trim(item_number))=lower(trim(line->>'item_number')) FOR UPDATE;
      IF item.id IS NOT NULL AND coalesce((p_data->>'update_existing')::boolean,false)=false THEN CONTINUE; END IF;
      INSERT INTO inventory_items(id,location_id,name,item_number,source,unit,unit_size,pack_size,category,unit_cost,case_price,packet_price,par_value,source_data)
      VALUES(coalesce(item.id,gen_random_uuid()),p_location,line->>'name',trim(line->>'item_number'),line->>'source',coalesce(line->>'unit_size','case'),line->>'unit_size',(line->>'pack_size')::numeric,
        line->>'category',(line->>'case_price')::numeric,(line->>'case_price')::numeric,(line->>'packet_price')::numeric,(line->>'par_value')::numeric,line)
      ON CONFLICT(id) DO UPDATE SET name=excluded.name,unit=excluded.unit,unit_size=excluded.unit_size,pack_size=excluded.pack_size,category=excluded.category,
        unit_cost=excluded.unit_cost,case_price=excluded.case_price,packet_price=excluded.packet_price,par_value=excluded.par_value,source_data=excluded.source_data RETURNING id INTO saved_id;
      PERFORM btb_event(p_location,'inventory_item',saved_id,'import',p_actor,to_jsonb(item),line);
    END LOOP;
    IF p_action='confirm_master' THEN UPDATE btb_document_imports SET status='confirmed',review_data=p_data,confirmed_by=p_actor,confirmed_at=now() WHERE id=doc.id; END IF;
    RETURN jsonb_build_object('ok',true);
  ELSIF p_action='reject_import' THEN
    IF coalesce(trim(p_data->>'reason'),'')='' THEN RAISE EXCEPTION 'Rejection reason required'; END IF;
    UPDATE btb_document_imports SET status='rejected',review_data=p_data,confirmed_by=p_actor,confirmed_at=now() WHERE id=(p_data->>'import_id')::uuid AND location_id=p_location AND accounting_month=p_month AND status='review' RETURNING id INTO saved_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'Review not available' USING ERRCODE='40001'; END IF;
    PERFORM btb_event(p_location,'import',saved_id,'reject',p_actor,NULL,p_data,p_data->>'reason');
    RETURN jsonb_build_object('ok',true);
  ELSIF p_action='confirm_purchase' THEN
    SELECT * INTO doc FROM btb_document_imports WHERE id=(p_data->>'import_id')::uuid AND location_id=p_location AND accounting_month=p_month AND kind IN ('gfs','local') FOR UPDATE;
    IF NOT FOUND OR doc.status<>'review' THEN RAISE EXCEPTION 'Document already confirmed or unavailable' USING ERRCODE='40001'; END IF;
    IF left(p_data->>'date',7)<>p_month THEN RAISE EXCEPTION 'Purchase date must belong to selected month'; END IF;
    vendor:=trim(p_data->>'vendor'); v_reference:=nullif(trim(p_data->>'reference'),''); v_amount:=(p_data->>'total')::numeric;
    IF coalesce(vendor,'')='' OR v_amount IS NULL OR v_amount<0 OR p_data->>'currency' IS DISTINCT FROM 'CAD' OR p_data->>'date' IS NULL THEN RAISE EXCEPTION 'Vendor, date, CAD total and review required'; END IF;
    IF doc.kind='gfs' AND v_reference IS NULL THEN RAISE EXCEPTION 'GFS invoice reference required'; END IF;
    IF coalesce((p_data->>'review_confirmed')::boolean,false)=false THEN RAISE EXCEPTION 'Confirm the reviewed source values'; END IF;
    IF EXISTS(SELECT 1 FROM inventory_purchases WHERE location_id=p_location AND voided_at IS NULL AND lower(trim(supplier))=lower(vendor) AND purchase_date=(p_data->>'date')::date AND amount=(p_data->>'total')::numeric AND reference IS NULL)
      AND coalesce(trim(p_data->>'duplicate_reason'),'')='' THEN RAISE EXCEPTION 'Possible duplicate receipt: explain why this is a separate purchase'; END IF;
    INSERT INTO inventory_purchases(location_id,count_month,purchase_date,type,supplier,description,amount,reference,notes,counted_by,document_id)
    VALUES(p_location,p_month,(p_data->>'date')::date,doc.kind,vendor,coalesce(p_data->>'description',vendor),v_amount,v_reference,p_data->>'notes',actor.name,doc.id) RETURNING id INTO saved_id;
    FOR line IN SELECT * FROM jsonb_array_elements(coalesce(p_data->'lines','[]')) LOOP
      IF nullif(line->>'item_id','') IS NOT NULL AND NOT EXISTS(SELECT 1 FROM inventory_items WHERE id=(line->>'item_id')::uuid AND location_id=p_location) THEN RAISE EXCEPTION 'Invoice item is outside this location'; END IF;
      INSERT INTO inventory_purchase_lines(purchase_id,item_id,description,item_code,cases,packets,unit_price,line_total,source_line)
      VALUES(saved_id,nullif(line->>'item_id','')::uuid,coalesce(line->>'description',''),line->>'item_code',coalesce((line->>'cases')::numeric,0),coalesce((line->>'packets')::numeric,0),(line->>'unit_price')::numeric,(line->>'line_total')::numeric,line);
    END LOOP;
    UPDATE btb_document_imports SET status='confirmed',review_data=p_data,confirmed_by=p_actor,confirmed_at=now(),confirmed_record_id=saved_id WHERE id=doc.id;
    -- A new invoice invalidates a previous completeness confirmation.
    UPDATE inventory_month_summary SET purchases_confirmed=false,version=version+1 WHERE location_id=p_location AND count_month=p_month;
    PERFORM btb_event(p_location,'purchase',saved_id,'confirm',p_actor,NULL,p_data);
    RETURN jsonb_build_object('id',saved_id);
  ELSIF p_action='void_purchase' THEN
    reason:=trim(p_data->>'reason');
    IF coalesce(reason,'')='' THEN RAISE EXCEPTION 'Correction reason required'; END IF;
    UPDATE inventory_purchases SET voided_at=now() WHERE id=(p_data->>'id')::uuid AND location_id=p_location AND count_month=p_month AND voided_at IS NULL RETURNING id INTO saved_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'Purchase not found'; END IF;
    UPDATE inventory_month_summary SET purchases_confirmed=false,version=version+1 WHERE location_id=p_location AND count_month=p_month;
    PERFORM btb_event(p_location,'purchase',saved_id,'void',p_actor,NULL,p_data,reason);
    RETURN jsonb_build_object('ok',true);
  ELSIF p_action='reopen' THEN
    reason:=trim(p_data->>'reason');
    IF snapshot.status IS DISTINCT FROM 'finalized' OR coalesce(reason,'')='' THEN RAISE EXCEPTION 'Finalized month and correction reason required'; END IF;
    IF EXISTS(SELECT 1 FROM inventory_month_snapshots WHERE location_id=p_location AND count_month>p_month AND status='finalized') THEN RAISE EXCEPTION 'Reopen downstream finalized months first' USING ERRCODE='40001'; END IF;
    UPDATE inventory_month_snapshots SET status='draft',reopened_by=actor.name,reopened_at=now(),reopen_reason=reason WHERE location_id=p_location AND count_month=p_month;
    INSERT INTO inventory_audit_log(location_id,count_month,action,actor,reason,snapshot,version) VALUES(p_location,p_month,'reopen',actor.name,reason,to_jsonb(snapshot),snapshot.version);
    PERFORM btb_event(p_location,'inventory_month',snapshot.id,'reopen',p_actor,to_jsonb(snapshot),NULL,reason);
    RETURN jsonb_build_object('ok',true);
  END IF;
  IF coalesce(summary.version,0)<>coalesce((p_data->>'version')::integer,-1) THEN RAISE EXCEPTION 'Accounting period changed; reload' USING ERRCODE='40001'; END IF;
  IF summary.id IS NULL THEN
    INSERT INTO inventory_month_summary(location_id,count_month,version) VALUES(p_location,p_month,1) RETURNING * INTO summary;
  ELSE UPDATE inventory_month_summary SET version=version+1 WHERE id=summary.id RETURNING * INTO summary; END IF;
  IF p_action='counts' THEN
    IF (SELECT count(DISTINCT c->>'item_id') FROM jsonb_array_elements(p_data->'counts') c)<>jsonb_array_length(p_data->'counts') THEN RAISE EXCEPTION 'Duplicate count items'; END IF;
    FOR line IN SELECT * FROM jsonb_array_elements(p_data->'counts') LOOP
      SELECT * INTO item FROM inventory_items WHERE id=(line->>'item_id')::uuid AND location_id=p_location;
      IF NOT FOUND OR item.case_price IS NULL OR item.packet_price IS NULL OR item.pack_size IS NULL THEN RAISE EXCEPTION 'Missing item costs or pack conversion'; END IF;
      IF (line->>'cases') IS NULL OR (line->>'packets') IS NULL THEN RAISE EXCEPTION 'Enter cases and packets explicitly, including zero'; END IF;
      INSERT INTO inventory_counts(location_id,item_id,count_month,qty,cases,packets,case_price_at_count,packet_price_at_count,line_value,counted_by)
      VALUES(p_location,item.id,p_month,(line->>'cases')::numeric+(line->>'packets')::numeric/item.pack_size,(line->>'cases')::numeric,(line->>'packets')::numeric,item.case_price,item.packet_price,
        round((line->>'cases')::numeric*item.case_price+(line->>'packets')::numeric*item.packet_price,2),actor.name)
      ON CONFLICT(item_id,count_month,location_id) DO UPDATE SET qty=excluded.qty,cases=excluded.cases,packets=excluded.packets,case_price_at_count=excluded.case_price_at_count,packet_price_at_count=excluded.packet_price_at_count,line_value=excluded.line_value,counted_by=excluded.counted_by;
    END LOOP;
  ELSIF p_action='inputs' THEN
    IF p_data ? 'opening' THEN
      IF previous.id IS NOT NULL OR EXISTS(SELECT 1 FROM inventory_month_snapshots WHERE location_id=p_location AND count_month<p_month) THEN RAISE EXCEPTION 'Opening must carry forward from the previous finalized month'; END IF;
      IF (p_data->>'opening') IS NULL OR (p_data->>'opening')::numeric<0 OR coalesce(trim(p_data->>'opening_reason'),'')='' THEN RAISE EXCEPTION 'Baseline opening and source explanation required'; END IF;
      UPDATE inventory_month_summary SET opening_value=(p_data->>'opening')::numeric,opening_confirmed=true,opening_reason=p_data->>'opening_reason' WHERE id=summary.id;
    END IF;
    IF p_data ? 'purchases_confirmed' THEN UPDATE inventory_month_summary SET purchases_confirmed=(p_data->>'purchases_confirmed')::boolean WHERE id=summary.id; END IF;
  ELSIF p_action='confirm_sales' THEN
    SELECT * INTO doc FROM btb_document_imports WHERE id=(p_data->>'import_id')::uuid AND location_id=p_location AND accounting_month=p_month AND kind='sales' AND status='review' FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Sales report already confirmed or unavailable'; END IF;
    IF p_data->>'month'<>p_month OR coalesce((p_data->>'review_confirmed')::boolean,false)=false THEN RAISE EXCEPTION 'Confirm the reporting month and reviewed figures'; END IF;
    IF summary.sales_confirmed AND coalesce(trim(p_data->>'reason'),'')='' THEN RAISE EXCEPTION 'Sales correction reason required'; END IF;
    figures:=p_data->'figures'; basis:=p_data->>'basis';
    IF (SELECT count(*) FROM jsonb_array_elements(figures) f WHERE f->>'label'=basis)<>1 THEN RAISE EXCEPTION 'Choose one unambiguous sales label'; END IF;
    SELECT (f->>'value')::numeric INTO v_sales FROM jsonb_array_elements(figures) f WHERE f->>'label'=basis;
    IF v_sales IS NULL OR v_sales<0 THEN RAISE EXCEPTION 'Nonnegative sales amount required'; END IF;
    UPDATE inventory_month_summary SET sales=v_sales,sales_confirmed=true,sales_basis=basis,sales_figures=figures,sales_document_id=doc.id WHERE id=summary.id;
    UPDATE btb_document_imports SET status='confirmed',review_data=p_data,confirmed_by=p_actor,confirmed_at=now(),confirmed_record_id=summary.id WHERE id=doc.id;
  ELSIF p_action='finalize' THEN
    IF previous.status='finalized' THEN opening:=previous.closing_value;
    ELSIF previous.id IS NULL AND summary.opening_confirmed THEN opening:=summary.opening_value;
    ELSE RAISE EXCEPTION 'Opening inventory missing or previous month is not finalized'; END IF;
    IF NOT summary.purchases_confirmed OR NOT summary.sales_confirmed OR summary.sales<=0 THEN RAISE EXCEPTION 'Confirm complete purchases and positive net sales before finalizing'; END IF;
    IF NOT EXISTS(SELECT 1 FROM inventory_items WHERE location_id=p_location) OR EXISTS(
      SELECT 1 FROM inventory_items i WHERE i.location_id=p_location AND NOT EXISTS(SELECT 1 FROM inventory_counts c WHERE c.item_id=i.id AND c.location_id=p_location AND c.count_month=p_month AND c.line_value IS NOT NULL)
    ) THEN RAISE EXCEPTION 'Every inventory item requires an explicit closing count'; END IF;
    IF EXISTS(SELECT 1 FROM btb_document_imports WHERE location_id=p_location AND status='review' AND accounting_month=p_month) THEN RAISE EXCEPTION 'Unreviewed documents remain for this month'; END IF;
    SELECT sum(c.line_value),jsonb_agg(jsonb_build_object('item',to_jsonb(i),'count',to_jsonb(c)) ORDER BY i.id) INTO closing,lines FROM inventory_counts c JOIN inventory_items i ON i.id=c.item_id WHERE c.location_id=p_location AND c.count_month=p_month;
    SELECT coalesce(sum(amount) FILTER(WHERE type='gfs'),0),coalesce(sum(amount) FILTER(WHERE type='local'),0) INTO gfs,local_total FROM inventory_purchases WHERE location_id=p_location AND count_month=p_month AND voided_at IS NULL;
    purchases_total:=gfs+local_total; cogs:=round(opening+purchases_total-closing,2); pct:=round(cogs/summary.sales*100,2);
    old_snapshot:=snapshot;
    INSERT INTO inventory_month_snapshots(location_id,scope_key,count_month,opening_value,closing_value,purchases,gfs_purchases,local_purchases,sales,cogs,food_cost_pct,status,finalized_by,finalized_at,version,item_snapshot,sales_basis)
    VALUES(p_location,p_location::text,p_month,opening,closing,purchases_total,gfs,local_total,summary.sales,cogs,pct,'finalized',actor.name,now(),coalesce(snapshot.version,0)+1,lines,summary.sales_basis)
    ON CONFLICT(count_month,scope_key) DO UPDATE SET opening_value=excluded.opening_value,closing_value=excluded.closing_value,purchases=excluded.purchases,gfs_purchases=excluded.gfs_purchases,local_purchases=excluded.local_purchases,
      sales=excluded.sales,cogs=excluded.cogs,food_cost_pct=excluded.food_cost_pct,status='finalized',finalized_by=excluded.finalized_by,finalized_at=excluded.finalized_at,version=excluded.version,item_snapshot=excluded.item_snapshot,sales_basis=excluded.sales_basis RETURNING * INTO snapshot;
    INSERT INTO inventory_audit_log(location_id,count_month,action,actor,snapshot,version) VALUES(p_location,p_month,'finalize',actor.name,to_jsonb(snapshot),snapshot.version);
    PERFORM btb_event(p_location,'inventory_month',snapshot.id,'finalize',p_actor,to_jsonb(old_snapshot),to_jsonb(snapshot));
    RETURN to_jsonb(snapshot);
  ELSE RAISE EXCEPTION 'Unknown inventory command'; END IF;
  PERFORM btb_event(p_location,'inventory_period',summary.id,p_action,p_actor,to_jsonb(summary),p_data);
  RETURN jsonb_build_object('ok',true,'version',summary.version);
END $$;

CREATE OR REPLACE FUNCTION public.purge_inventory_counts()
RETURNS void LANGUAGE sql AS $$
  DELETE FROM inventory_counts WHERE location_id IS NULL AND count_month < to_char(now()-interval '24 months','YYYY-MM');
$$;

DO $$ DECLARE tab text; f record; BEGIN
  FOREACH tab IN ARRAY ARRAY['inventory_items','inventory_counts','inventory_purchases','inventory_month_summary','inventory_month_snapshots','inventory_audit_log','inventory_purchase_lines','btb_document_imports'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY',tab); EXECUTE format('REVOKE ALL ON %I FROM PUBLIC,anon,authenticated',tab); EXECUTE format('GRANT ALL ON %I TO service_role',tab);
  END LOOP;
  GRANT USAGE,SELECT ON SEQUENCE inventory_audit_log_id_seq TO service_role;
  -- Never allow the legacy retention task to delete source counts of finalized location periods.
  REVOKE ALL ON FUNCTION purge_inventory_counts() FROM PUBLIC,anon,authenticated;
  FOR f IN SELECT oid::regprocedure sig FROM pg_proc WHERE pronamespace='public'::regnamespace AND proname LIKE 'btb_platform_%' LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC,anon,authenticated',f.sig); EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role',f.sig);
  END LOOP;
END $$;
NOTIFY pgrst,'reload schema';
COMMIT;
