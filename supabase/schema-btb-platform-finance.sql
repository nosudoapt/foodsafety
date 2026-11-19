-- Release 12. Apply AFTER all six location-platform releases. No production seeds.
-- Approved source documents -> invoices, stock receipts and supplier price history.
-- Bank allocations and GST closes are reviewed, versioned, location-scoped transactions.
BEGIN;

CREATE TABLE IF NOT EXISTS btb_invoices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), location_id uuid NOT NULL REFERENCES btb_location_settings(location_id),
  purchase_id uuid NOT NULL UNIQUE REFERENCES inventory_purchases(id), import_id uuid NOT NULL UNIQUE REFERENCES btb_document_imports(id),
  vendor text NOT NULL, reference text, invoice_date date NOT NULL, due_date date,
  total numeric(14,2) NOT NULL CHECK(total>=0), subtotal numeric(14,2) CHECK(subtotal>=0), gst numeric(14,2) CHECK(gst>=0),
  other_tax numeric(14,2) CHECK(other_tax>=0), charges numeric(14,2) CHECK(charges>=0), itc_eligible boolean,
  tax_confirmed boolean NOT NULL DEFAULT false, notes text NOT NULL DEFAULT '', version integer NOT NULL DEFAULT 1,
  created_by uuid REFERENCES btb_employees(id), created_at timestamptz NOT NULL DEFAULT now(), voided_at timestamptz,
  CHECK(NOT tax_confirmed OR (subtotal IS NOT NULL AND gst IS NOT NULL AND other_tax IS NOT NULL AND charges IS NOT NULL
    AND itc_eligible IS NOT NULL AND subtotal+gst+other_tax+charges=total))
);
CREATE INDEX IF NOT EXISTS btb_invoices_period ON btb_invoices(location_id,invoice_date);

CREATE TABLE IF NOT EXISTS btb_stock_balances (
  item_id uuid PRIMARY KEY REFERENCES inventory_items(id), location_id uuid NOT NULL REFERENCES btb_location_settings(location_id),
  opening_packets numeric(16,4) CHECK(opening_packets>=0), baseline_at timestamptz,
  version integer NOT NULL DEFAULT 1, counted_by uuid REFERENCES btb_employees(id),
  CHECK((opening_packets IS NULL)=(baseline_at IS NULL))
);
CREATE TABLE IF NOT EXISTS btb_stock_movements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), location_id uuid NOT NULL REFERENCES btb_location_settings(location_id),
  item_id uuid NOT NULL REFERENCES inventory_items(id), purchase_id uuid REFERENCES inventory_purchases(id),
  source_id uuid NOT NULL, kind text NOT NULL CHECK(kind IN ('receipt','void','adjustment')),
  packet_delta numeric(16,4) NOT NULL, pack_size numeric(12,4) NOT NULL CHECK(pack_size>0),
  effective_at timestamptz NOT NULL DEFAULT now(), created_at timestamptz NOT NULL DEFAULT now(),
  actor_id uuid NOT NULL REFERENCES btb_employees(id), reason text, UNIQUE(kind,source_id)
);
CREATE INDEX IF NOT EXISTS btb_stock_item ON btb_stock_movements(location_id,item_id,effective_at);
CREATE TABLE IF NOT EXISTS btb_supplier_prices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), location_id uuid NOT NULL REFERENCES btb_location_settings(location_id),
  item_id uuid NOT NULL REFERENCES inventory_items(id), purchase_id uuid NOT NULL REFERENCES inventory_purchases(id),
  line_id uuid NOT NULL REFERENCES inventory_purchase_lines(id), vendor text NOT NULL,
  price_basis text NOT NULL CHECK(price_basis IN ('case','packet')), price numeric(12,4) NOT NULL CHECK(price>=0),
  previous_catalog_price numeric(12,4), invoice_date date NOT NULL, derived boolean NOT NULL DEFAULT false,
  apply_catalog boolean NOT NULL DEFAULT false, created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(line_id,price_basis)
);
CREATE INDEX IF NOT EXISTS btb_supplier_price_item ON btb_supplier_prices(location_id,item_id,invoice_date);

-- Stock count drafts include the balance version. Changing the case conversion
-- must invalidate those drafts even when the item has no physical baseline yet.
CREATE OR REPLACE FUNCTION btb_stock_catalogue_version()
RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$
BEGIN
  IF NEW.location_id IS NOT NULL AND OLD.pack_size IS DISTINCT FROM NEW.pack_size THEN
    INSERT INTO btb_stock_balances(item_id,location_id,version) VALUES(NEW.id,NEW.location_id,1)
      ON CONFLICT(item_id) DO UPDATE SET version=btb_stock_balances.version+1;
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS btb_stock_catalogue_change ON inventory_items;
CREATE TRIGGER btb_stock_catalogue_change AFTER UPDATE OF pack_size ON inventory_items FOR EACH ROW EXECUTE FUNCTION btb_stock_catalogue_version();

CREATE TABLE IF NOT EXISTS btb_bank_accounts (
  id uuid PRIMARY KEY, location_id uuid NOT NULL REFERENCES btb_location_settings(location_id), name text NOT NULL,
  created_by uuid NOT NULL REFERENCES btb_employees(id), created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(location_id,name)
);
CREATE TABLE IF NOT EXISTS btb_bank_statements (
  id uuid PRIMARY KEY, account_id uuid NOT NULL REFERENCES btb_bank_accounts(id),
  location_id uuid NOT NULL REFERENCES btb_location_settings(location_id), name text NOT NULL,
  from_date date NOT NULL, to_date date NOT NULL, opening_balance numeric(14,2), closing_balance numeric(14,2),
  sha256 text NOT NULL CHECK(sha256 ~ '^[a-f0-9]{64}$'), raw_csv text NOT NULL CHECK(length(raw_csv)<=3145728),
  transaction_total numeric(14,2) NOT NULL, balances_confirmed boolean NOT NULL DEFAULT false,
  status text NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','reconciled')),
  version integer NOT NULL DEFAULT 1, created_by uuid NOT NULL REFERENCES btb_employees(id),
  created_at timestamptz NOT NULL DEFAULT now(), reconciled_at timestamptz, reconciled_by uuid REFERENCES btb_employees(id),
  CHECK(from_date<=to_date AND to_date-from_date<=365), UNIQUE(account_id,sha256)
);
CREATE TABLE IF NOT EXISTS btb_bank_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), statement_id uuid NOT NULL REFERENCES btb_bank_statements(id),
  line_number integer NOT NULL, transaction_date date NOT NULL, description text NOT NULL, reference text,
  amount numeric(14,2) NOT NULL CHECK(amount<>0), version integer NOT NULL DEFAULT 1, UNIQUE(statement_id,line_number)
);
CREATE INDEX IF NOT EXISTS btb_bank_transaction_statement ON btb_bank_transactions(statement_id);
CREATE TABLE IF NOT EXISTS btb_bank_allocations (
  id uuid PRIMARY KEY, transaction_id uuid NOT NULL REFERENCES btb_bank_transactions(id), invoice_id uuid REFERENCES btb_invoices(id),
  amount numeric(14,2) NOT NULL CHECK(amount>0), category text CHECK(category IN ('sales','fees','rent','payroll','utilities','tax','transfer','refund','other')),
  notes text NOT NULL DEFAULT '', created_by uuid NOT NULL REFERENCES btb_employees(id),
  created_at timestamptz NOT NULL DEFAULT now(), voided_at timestamptz, voided_by uuid REFERENCES btb_employees(id),
  CHECK((invoice_id IS NOT NULL AND category IS NULL) OR (invoice_id IS NULL AND category IS NOT NULL))
);
CREATE INDEX IF NOT EXISTS btb_bank_allocation_invoice ON btb_bank_allocations(invoice_id) WHERE voided_at IS NULL;
CREATE TABLE IF NOT EXISTS btb_gst_periods (
  id uuid PRIMARY KEY, location_id uuid NOT NULL REFERENCES btb_location_settings(location_id),
  from_date date NOT NULL, to_date date NOT NULL, collected numeric(14,2) CHECK(collected>=0), adjustments numeric(14,2),
  purchases_complete boolean NOT NULL DEFAULT false, sales_complete boolean NOT NULL DEFAULT false,
  input_tax numeric(14,2), net_due numeric(14,2), notes text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','finalized','filed')), version integer NOT NULL DEFAULT 1,
  finalized_at timestamptz, finalized_by uuid REFERENCES btb_employees(id), filed_on date, filing_reference text,
  CHECK(from_date<=to_date AND to_date-from_date<=365), UNIQUE(location_id,from_date,to_date),
  CHECK(status='draft' OR (collected IS NOT NULL AND adjustments IS NOT NULL AND input_tax IS NOT NULL AND net_due IS NOT NULL))
);
CREATE TABLE IF NOT EXISTS btb_finance_commands (
  id uuid PRIMARY KEY, actor_id uuid NOT NULL REFERENCES btb_employees(id), location_id uuid NOT NULL REFERENCES btb_location_settings(location_id),
  action text NOT NULL, data jsonb NOT NULL, result jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
);

-- Existing documents are retained as invoices with UNVERIFIED tax. Do not post
-- historical receipts to live stock or invent historical supplier prices.
INSERT INTO btb_invoices(location_id,purchase_id,import_id,vendor,reference,invoice_date,total,created_by,voided_at)
SELECT p.location_id,p.id,d.id,p.supplier,p.reference,p.purchase_date,p.amount,d.confirmed_by,p.voided_at
FROM inventory_purchases p JOIN btb_document_imports d ON d.id=p.document_id
WHERE p.location_id IS NOT NULL AND d.status='confirmed' AND d.kind IN ('gfs','local')
ON CONFLICT(purchase_id) DO NOTHING;

CREATE OR REPLACE FUNCTION btb_finance_open_tax(p_location uuid,p_date date)
RETURNS void LANGUAGE plpgsql SET search_path=public AS $$
BEGIN
  IF EXISTS(SELECT 1 FROM btb_gst_periods WHERE location_id=p_location AND p_date BETWEEN from_date AND to_date AND status<>'draft') THEN
    RAISE EXCEPTION 'Reopen the finalized GST period before changing its source invoices' USING ERRCODE='40001';
  END IF;
END $$;

CREATE OR REPLACE FUNCTION btb_refresh_item_prices(p_item uuid)
RETURNS void LANGUAGE plpgsql SET search_path=public AS $$
DECLARE basis text; v_price numeric;
BEGIN
  FOREACH basis IN ARRAY ARRAY['case','packet'] LOOP
    SELECT h.price INTO v_price FROM btb_supplier_prices h JOIN inventory_purchases p ON p.id=h.purchase_id
      WHERE h.item_id=p_item AND h.price_basis=basis AND h.apply_catalog AND p.voided_at IS NULL
      ORDER BY h.invoice_date DESC,h.created_at DESC,h.id DESC LIMIT 1;
    IF NOT FOUND THEN
      SELECT h.previous_catalog_price INTO v_price FROM btb_supplier_prices h
        WHERE h.item_id=p_item AND h.price_basis=basis AND h.apply_catalog ORDER BY h.created_at,h.id LIMIT 1;
    END IF;
    IF v_price IS NOT NULL THEN
      IF basis='case' THEN UPDATE inventory_items SET case_price=v_price,unit_cost=v_price WHERE id=p_item;
      ELSE UPDATE inventory_items SET packet_price=v_price WHERE id=p_item; END IF;
    END IF;
  END LOOP;
END $$;

-- This is the inventory API's entry point for release 12. Calls the existing
-- period state machine and posts all invoice effects in that SAME transaction.
CREATE OR REPLACE FUNCTION btb_platform_inventory_finance(p_actor uuid,p_session integer,p_location uuid,p_month text,p_action text,p_data jsonb)
RETURNS jsonb LANGUAGE plpgsql SET search_path=public AS $$
DECLARE actor btb_employees; result jsonb; doc btb_document_imports; inv btb_invoices;
  line jsonb; mapped jsonb:='[]'; item inventory_items; purchased inventory_purchase_lines; v_total numeric; cost numeric;
  tax_ok boolean; v_id uuid; basis text; apply_prices boolean; touched record;
BEGIN
  actor:=btb_platform_assert(p_actor,p_session,p_location,'inventory.write');
  PERFORM pg_advisory_xact_lock(hashtextextended('inventory:'||p_location,0));
   IF p_action='confirm_purchase' THEN
    SELECT * INTO doc FROM btb_document_imports WHERE id=(p_data->>'import_id')::uuid AND location_id=p_location AND accounting_month=p_month FOR UPDATE;
    IF doc.status='confirmed' AND doc.review_data=p_data THEN RETURN jsonb_build_object('id',doc.confirmed_record_id,'replayed',true); END IF;
    IF doc.id IS NULL OR doc.kind NOT IN ('gfs','local') OR doc.status<>'review' THEN RAISE EXCEPTION 'Document already confirmed or unavailable' USING ERRCODE='40001'; END IF;
    PERFORM btb_finance_open_tax(p_location,(p_data->>'date')::date);
    v_total:=(p_data->>'total')::numeric;
    tax_ok:=coalesce((p_data->>'tax_confirmed')::boolean,false);
    IF tax_ok AND ((p_data->>'subtotal') IS NULL OR (p_data->>'gst') IS NULL OR (p_data->>'other_tax') IS NULL OR (p_data->>'charges') IS NULL OR (p_data->>'itc_eligible') IS NULL
      OR (p_data->>'subtotal')::numeric+(p_data->>'gst')::numeric+(p_data->>'other_tax')::numeric+(p_data->>'charges')::numeric IS DISTINCT FROM v_total) THEN
      RAISE EXCEPTION 'Review an exact tax breakdown and input-tax eligibility' USING ERRCODE='22023'; END IF;
    cost:=CASE WHEN tax_ok THEN v_total-CASE WHEN (p_data->>'itc_eligible')::boolean THEN (p_data->>'gst')::numeric ELSE 0 END ELSE v_total END;
    IF jsonb_typeof(p_data->'lines') IS DISTINCT FROM 'array' OR jsonb_array_length(p_data->'lines') NOT BETWEEN 1 AND 2000 THEN RAISE EXCEPTION 'Review the invoice lines' USING ERRCODE='22023'; END IF;
    FOR line IN SELECT * FROM jsonb_array_elements(p_data->'lines') LOOP
      item:=NULL;
      IF nullif(line->>'item_id','') IS NOT NULL THEN
        SELECT * INTO item FROM inventory_items WHERE id=(line->>'item_id')::uuid AND location_id=p_location;
        IF item.id IS NULL THEN RAISE EXCEPTION 'Item is outside this location' USING ERRCODE='42501'; END IF;
      END IF;
      IF (line->>'cases') IS NULL OR (line->>'packets') IS NULL OR (line->>'line_total') IS NULL OR coalesce(trim(line->>'description'),'')='' THEN
        RAISE EXCEPTION 'Explicit quantities and line totals required' USING ERRCODE='22023'; END IF;
      IF item.id IS NULL AND NOT coalesce((line->>'stock_excluded')::boolean,false) THEN RAISE EXCEPTION 'Map the stock item or explicitly exclude this expense from stock' USING ERRCODE='22023'; END IF;
      IF item.id IS NOT NULL AND (item.pack_size IS NULL OR item.pack_size<=0) THEN RAISE EXCEPTION 'Confirm the item pack conversion before receiving stock' USING ERRCODE='22023'; END IF;
       IF item.id IS NOT NULL AND coalesce((line->>'stock_excluded')::boolean,false) THEN RAISE EXCEPTION 'A stock line cannot also be excluded' USING ERRCODE='22023'; END IF;
       IF (line->>'cases')::numeric<0 OR (line->>'packets')::numeric<0 OR (line->>'line_total')::numeric<0 OR (line->>'unit_price')::numeric<0 THEN RAISE EXCEPTION 'Credit notes need separate review; quantities and prices cannot be negative' USING ERRCODE='22023'; END IF;
       IF (line->>'unit_price') IS NOT NULL AND coalesce(line->>'price_basis','') NOT IN ('case','packet') THEN RAISE EXCEPTION 'Choose the printed price unit' USING ERRCODE='22023'; END IF;
      mapped:=mapped||jsonb_build_array(line);
    END LOOP;
    result:=btb_platform_inventory(p_actor,p_session,p_location,p_month,p_action,p_data||jsonb_build_object('total',cost,'lines',mapped));
    v_id:=(result->>'id')::uuid;
    INSERT INTO btb_invoices(location_id,purchase_id,import_id,vendor,reference,invoice_date,due_date,total,subtotal,gst,other_tax,charges,itc_eligible,tax_confirmed,created_by)
      VALUES(p_location,v_id,doc.id,trim(p_data->>'vendor'),nullif(trim(p_data->>'reference'),''),(p_data->>'date')::date,nullif(p_data->>'due_date','')::date,
        v_total,(p_data->>'subtotal')::numeric,(p_data->>'gst')::numeric,(p_data->>'other_tax')::numeric,(p_data->>'charges')::numeric,(p_data->>'itc_eligible')::boolean,tax_ok,p_actor) RETURNING * INTO inv;
    UPDATE btb_document_imports SET review_data=p_data WHERE id=doc.id;
    apply_prices:=coalesce((p_data->>'update_prices')::boolean,false);
    FOR purchased IN SELECT * FROM inventory_purchase_lines WHERE purchase_id=v_id AND item_id IS NOT NULL LOOP
      SELECT * INTO item FROM inventory_items WHERE id=purchased.item_id;
       INSERT INTO btb_stock_movements(location_id,item_id,purchase_id,source_id,kind,packet_delta,pack_size,actor_id)
         VALUES(p_location,item.id,v_id,purchased.id,'receipt',purchased.cases*item.pack_size+purchased.packets,item.pack_size,p_actor);
       -- Even an item without a physical baseline has a version. A count opened
       -- before this delivery must not silently overwrite newly received stock.
       INSERT INTO btb_stock_balances(item_id,location_id,version) VALUES(item.id,p_location,1)
         ON CONFLICT(item_id) DO UPDATE SET version=btb_stock_balances.version+1;
      basis:=purchased.source_line->>'price_basis';
      IF purchased.unit_price IS NOT NULL THEN
        INSERT INTO btb_supplier_prices(location_id,item_id,purchase_id,line_id,vendor,price_basis,price,previous_catalog_price,invoice_date,apply_catalog)
          VALUES(p_location,item.id,v_id,purchased.id,inv.vendor,basis,purchased.unit_price,CASE WHEN basis='case' THEN item.case_price ELSE item.packet_price END,inv.invoice_date,apply_prices);
        IF basis='case' AND apply_prices THEN
          INSERT INTO btb_supplier_prices(location_id,item_id,purchase_id,line_id,vendor,price_basis,price,previous_catalog_price,invoice_date,derived,apply_catalog)
            VALUES(p_location,item.id,v_id,purchased.id,inv.vendor,'packet',round(purchased.unit_price/item.pack_size,4),item.packet_price,inv.invoice_date,true,true);
        END IF;
        PERFORM btb_refresh_item_prices(item.id);
      END IF;
    END LOOP;
    PERFORM btb_event(p_location,'invoice',inv.id,'confirm',p_actor,NULL,to_jsonb(inv));
    RETURN result||jsonb_build_object('invoice_id',inv.id);
  ELSIF p_action='void_purchase' THEN
    SELECT * INTO inv FROM btb_invoices WHERE purchase_id=(p_data->>'id')::uuid AND location_id=p_location FOR UPDATE;
     IF inv.id IS NOT NULL THEN
      PERFORM btb_finance_open_tax(p_location,inv.invoice_date);
       IF EXISTS(SELECT 1 FROM btb_bank_allocations WHERE invoice_id=inv.id AND voided_at IS NULL) THEN RAISE EXCEPTION 'Unmatch bank payments before voiding an invoice' USING ERRCODE='22023'; END IF;
     END IF;
     IF EXISTS(SELECT 1 FROM btb_stock_balances b WHERE b.location_id=p_location AND b.baseline_at IS NOT NULL
       AND b.opening_packets+coalesce((SELECT sum(m.packet_delta) FROM btb_stock_movements m WHERE m.item_id=b.item_id AND m.effective_at>=b.baseline_at),0)
         -coalesce((SELECT sum(m.packet_delta) FROM btb_stock_movements m WHERE m.item_id=b.item_id AND m.purchase_id=(p_data->>'id')::uuid AND m.kind='receipt' AND m.effective_at>=b.baseline_at),0)<0) THEN
       RAISE EXCEPTION 'Voiding would make stock negative; recount affected items first' USING ERRCODE='22023'; END IF;
    result:=btb_platform_inventory(p_actor,p_session,p_location,p_month,p_action,p_data);
    UPDATE btb_invoices SET voided_at=now(),version=version+1 WHERE id=inv.id;
    INSERT INTO btb_stock_movements(location_id,item_id,purchase_id,source_id,kind,packet_delta,pack_size,effective_at,actor_id,reason)
      SELECT location_id,item_id,purchase_id,id,'void',-packet_delta,pack_size,effective_at,p_actor,p_data->>'reason'
       FROM btb_stock_movements WHERE purchase_id=(p_data->>'id')::uuid AND kind='receipt';
     UPDATE btb_stock_balances SET version=version+1 WHERE item_id IN
       (SELECT item_id FROM btb_stock_movements WHERE purchase_id=(p_data->>'id')::uuid AND kind='receipt');
    FOR touched IN SELECT DISTINCT item_id FROM btb_supplier_prices WHERE purchase_id=(p_data->>'id')::uuid LOOP PERFORM btb_refresh_item_prices(touched.item_id); END LOOP;
    IF inv.id IS NOT NULL THEN PERFORM btb_event(p_location,'invoice',inv.id,'void',p_actor,to_jsonb(inv),NULL,p_data->>'reason'); END IF;
    RETURN result;
  ELSIF p_action='finalize' THEN
    IF EXISTS(SELECT 1 FROM btb_invoices WHERE location_id=p_location AND to_char(invoice_date,'YYYY-MM')=p_month AND voided_at IS NULL AND NOT tax_confirmed) THEN
      RAISE EXCEPTION 'Verify invoice tax and purchase costing before finalizing COGS' USING ERRCODE='22023'; END IF;
  END IF;
  RETURN btb_platform_inventory(p_actor,p_session,p_location,p_month,p_action,p_data);
END $$;

CREATE OR REPLACE FUNCTION btb_platform_finance(p_actor uuid,p_session integer,p_location uuid,p_request uuid,p_action text,p_data jsonb)
RETURNS jsonb LANGUAGE plpgsql SET search_path=public AS $$
DECLARE actor btb_employees; prior btb_finance_commands; result jsonb:='{"ok":true}'; inv btb_invoices;
  item inventory_items; balance btb_stock_balances; stmt btb_bank_statements; txn btb_bank_transactions;
  allocation btb_bank_allocations; period btb_gst_periods; line jsonb; v_id uuid; v_amount numeric;
  allocated numeric; paid numeric; net numeric; input numeric; qty numeric; v_from date; v_to date;
BEGIN
  actor:=btb_platform_assert(p_actor,p_session,p_location,'inventory.write');
  IF p_request IS NULL OR jsonb_typeof(p_data) IS DISTINCT FROM 'object' OR length(coalesce(p_data->>'notes',''))>2000 OR length(coalesce(p_data->>'reason',''))>2000 THEN RAISE EXCEPTION 'Invalid finance command' USING ERRCODE='22023'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('inventory:'||p_location,0));
  SELECT * INTO prior FROM btb_finance_commands WHERE id=p_request;
  IF prior.id IS NOT NULL THEN
    IF prior.actor_id<>p_actor OR prior.location_id<>p_location OR prior.action<>p_action OR prior.data<>p_data THEN RAISE EXCEPTION 'Request key already used' USING ERRCODE='40001'; END IF;
    RETURN prior.result;
  END IF;
  v_id:=(p_data->>'id')::uuid;
  IF p_action IN ('invoice_terms','invoice_tax') THEN
    SELECT * INTO inv FROM btb_invoices WHERE id=v_id AND location_id=p_location AND voided_at IS NULL FOR UPDATE;
    IF inv.id IS NULL OR inv.version IS DISTINCT FROM (p_data->>'version')::integer THEN RAISE EXCEPTION 'Invoice changed; reload' USING ERRCODE='40001'; END IF;
    IF p_action='invoice_tax' THEN
      PERFORM btb_finance_open_tax(p_location,inv.invoice_date);
      IF EXISTS(SELECT 1 FROM inventory_month_snapshots WHERE location_id=p_location AND count_month=to_char(inv.invoice_date,'YYYY-MM') AND status='finalized') THEN RAISE EXCEPTION 'Reopen the inventory month before changing purchase cost' USING ERRCODE='40001'; END IF;
      IF (p_data->>'subtotal') IS NULL OR (p_data->>'gst') IS NULL OR (p_data->>'other_tax') IS NULL OR (p_data->>'charges') IS NULL OR (p_data->>'itc_eligible') IS NULL
        OR (p_data->>'subtotal')::numeric+(p_data->>'gst')::numeric+(p_data->>'other_tax')::numeric+(p_data->>'charges')::numeric IS DISTINCT FROM inv.total THEN RAISE EXCEPTION 'Invoice tax breakdown does not equal its total' USING ERRCODE='22023'; END IF;
      UPDATE btb_invoices SET subtotal=(p_data->>'subtotal')::numeric,gst=(p_data->>'gst')::numeric,other_tax=(p_data->>'other_tax')::numeric,
        charges=(p_data->>'charges')::numeric,itc_eligible=(p_data->>'itc_eligible')::boolean,tax_confirmed=true,version=version+1 WHERE id=v_id;
      UPDATE inventory_purchases SET amount=inv.total-CASE WHEN (p_data->>'itc_eligible')::boolean THEN (p_data->>'gst')::numeric ELSE 0 END WHERE id=inv.purchase_id;
      UPDATE inventory_month_summary SET purchases_confirmed=false,version=version+1 WHERE location_id=p_location AND count_month=to_char(inv.invoice_date,'YYYY-MM');
    ELSE
      UPDATE btb_invoices SET due_date=nullif(p_data->>'due_date','')::date,notes=coalesce(p_data->>'notes',''),version=version+1 WHERE id=v_id;
    END IF;
    PERFORM btb_event(p_location,'invoice',v_id,p_action,p_actor,to_jsonb(inv),(SELECT to_jsonb(i) FROM btb_invoices i WHERE id=v_id),p_data->>'reason');
  ELSIF p_action IN ('stock_count','stock_adjust') THEN
    SELECT * INTO item FROM inventory_items WHERE id=v_id AND location_id=p_location;
    IF item.id IS NULL OR item.pack_size IS NULL THEN RAISE EXCEPTION 'Choose a mapped inventory item' USING ERRCODE='42501'; END IF;
    SELECT * INTO balance FROM btb_stock_balances WHERE item_id=v_id FOR UPDATE;
    IF coalesce(balance.version,0) IS DISTINCT FROM (p_data->>'version')::integer THEN RAISE EXCEPTION 'Stock count changed; reload' USING ERRCODE='40001'; END IF;
    IF coalesce(trim(p_data->>'reason'),'')='' OR (p_data->>'cases') IS NULL OR (p_data->>'packets') IS NULL THEN RAISE EXCEPTION 'Explicit count and source reason required' USING ERRCODE='22023'; END IF;
    qty:=(p_data->>'cases')::numeric*item.pack_size+(p_data->>'packets')::numeric;
    IF p_action='stock_count' THEN
      IF (p_data->>'cases')::numeric<0 OR (p_data->>'packets')::numeric<0 THEN RAISE EXCEPTION 'Count cannot be negative' USING ERRCODE='22023'; END IF;
      INSERT INTO btb_stock_balances(item_id,location_id,opening_packets,baseline_at,version,counted_by) VALUES(v_id,p_location,qty,clock_timestamp(),coalesce(balance.version,0)+1,p_actor)
        ON CONFLICT(item_id) DO UPDATE SET opening_packets=excluded.opening_packets,baseline_at=excluded.baseline_at,version=excluded.version,counted_by=excluded.counted_by;
    ELSE
      IF balance.baseline_at IS NULL OR qty=0 THEN RAISE EXCEPTION 'Set an opening count and enter a nonzero adjustment' USING ERRCODE='22023'; END IF;
      SELECT balance.opening_packets+coalesce(sum(packet_delta),0) INTO net FROM btb_stock_movements WHERE item_id=v_id AND effective_at>=balance.baseline_at;
      IF net+qty<0 THEN RAISE EXCEPTION 'Adjustment would make stock negative; recount the item' USING ERRCODE='22023'; END IF;
      INSERT INTO btb_stock_movements(location_id,item_id,source_id,kind,packet_delta,pack_size,effective_at,actor_id,reason)
        VALUES(p_location,v_id,p_request,'adjustment',qty,item.pack_size,clock_timestamp(),p_actor,p_data->>'reason');
      UPDATE btb_stock_balances SET version=version+1 WHERE item_id=v_id;
    END IF;
    PERFORM btb_event(p_location,'stock',v_id,p_action,p_actor,to_jsonb(balance),p_data,p_data->>'reason');
  ELSIF p_action='bank_account' THEN
    IF coalesce(trim(p_data->>'name'),'')='' OR length(p_data->>'name')>120 THEN RAISE EXCEPTION 'Account name required' USING ERRCODE='22023'; END IF;
    INSERT INTO btb_bank_accounts(id,location_id,name,created_by) VALUES(v_id,p_location,trim(p_data->>'name'),p_actor);
    PERFORM btb_event(p_location,'bank_account',v_id,'create',p_actor,NULL,jsonb_build_object('name',p_data->>'name'));
  ELSIF p_action='bank_import' THEN
    IF NOT EXISTS(SELECT 1 FROM btb_bank_accounts WHERE id=(p_data->>'account_id')::uuid AND location_id=p_location) THEN RAISE EXCEPTION 'Account is outside this location' USING ERRCODE='42501'; END IF;
    v_from:=(p_data->>'from_date')::date; v_to:=(p_data->>'to_date')::date;
    IF v_from IS NULL OR v_to IS NULL OR v_to<v_from OR v_to-v_from>365 OR jsonb_typeof(p_data->'transactions') IS DISTINCT FROM 'array'
      OR jsonb_array_length(p_data->'transactions') NOT BETWEEN 1 AND 5000 THEN RAISE EXCEPTION 'Invalid statement dates or rows' USING ERRCODE='22023'; END IF;
    IF EXISTS(SELECT 1 FROM btb_bank_statements WHERE account_id=(p_data->>'account_id')::uuid AND from_date<=v_to AND to_date>=v_from) THEN
      RAISE EXCEPTION 'Statement overlaps an existing import; do not duplicate bank rows' USING ERRCODE='40001'; END IF;
    SELECT sum((r->>'amount')::numeric) INTO net FROM jsonb_array_elements(p_data->'transactions') r;
     INSERT INTO btb_bank_statements(id,account_id,location_id,name,from_date,to_date,opening_balance,closing_balance,balances_confirmed,sha256,raw_csv,transaction_total,created_by)
       VALUES(v_id,(p_data->>'account_id')::uuid,p_location,p_data->>'name',v_from,v_to,(p_data->>'opening_balance')::numeric,(p_data->>'closing_balance')::numeric,
         coalesce((p_data->>'balances_confirmed')::boolean,false),p_data->>'sha256',p_data->>'raw_csv',net,p_actor);
    FOR line IN SELECT * FROM jsonb_array_elements(p_data->'transactions') LOOP
      IF (line->>'transaction_date')::date NOT BETWEEN v_from AND v_to OR coalesce(trim(line->>'description'),'')='' OR length(line->>'description')>1000
        OR (line->>'amount') IS NULL OR (line->>'line_number') IS NULL THEN RAISE EXCEPTION 'Invalid statement row' USING ERRCODE='22023'; END IF;
      INSERT INTO btb_bank_transactions(statement_id,line_number,transaction_date,description,reference,amount)
        VALUES(v_id,(line->>'line_number')::integer,(line->>'transaction_date')::date,line->>'description',nullif(line->>'reference',''),(line->>'amount')::numeric);
    END LOOP;
     PERFORM btb_event(p_location,'bank_statement',v_id,'import',p_actor,NULL,p_data-'raw_csv'-'transactions');
   ELSIF p_action='bank_balances' THEN
     SELECT * INTO stmt FROM btb_bank_statements WHERE id=v_id AND location_id=p_location FOR UPDATE;
     IF stmt.id IS NULL OR stmt.version IS DISTINCT FROM (p_data->>'version')::integer OR stmt.status<>'draft' THEN RAISE EXCEPTION 'Reload the draft statement before correcting balances' USING ERRCODE='40001'; END IF;
     IF coalesce(trim(p_data->>'reason'),'')='' THEN RAISE EXCEPTION 'Balance correction reason required' USING ERRCODE='22023'; END IF;
     IF (p_data->>'opening_balance') IS NULL OR (p_data->>'closing_balance') IS NULL OR (p_data->>'balances_confirmed')::boolean IS DISTINCT FROM true THEN RAISE EXCEPTION 'Check both balances against the actual statement' USING ERRCODE='22023'; END IF;
     UPDATE btb_bank_statements SET opening_balance=(p_data->>'opening_balance')::numeric,closing_balance=(p_data->>'closing_balance')::numeric,
       balances_confirmed=true,version=version+1 WHERE id=v_id;
     PERFORM btb_event(p_location,'bank_statement',v_id,p_action,p_actor,to_jsonb(stmt)-'raw_csv',p_data,p_data->>'reason');
  ELSIF p_action IN ('bank_match','bank_unmatch') THEN
    IF p_action='bank_unmatch' THEN
      SELECT a.* INTO allocation FROM btb_bank_allocations a JOIN btb_bank_transactions t ON t.id=a.transaction_id JOIN btb_bank_statements s ON s.id=t.statement_id
        WHERE a.id=v_id AND s.location_id=p_location AND a.voided_at IS NULL FOR UPDATE OF a;
      IF allocation.id IS NULL OR coalesce(trim(p_data->>'reason'),'')='' THEN RAISE EXCEPTION 'Saved allocation and correction reason required' USING ERRCODE='22023'; END IF;
    END IF;
    SELECT t.* INTO txn FROM btb_bank_transactions t JOIN btb_bank_statements s ON s.id=t.statement_id
      WHERE t.id=CASE WHEN p_action='bank_match' THEN (p_data->>'transaction_id')::uuid ELSE allocation.transaction_id END AND s.location_id=p_location FOR UPDATE OF t;
    IF txn.id IS NULL OR txn.version IS DISTINCT FROM (p_data->>'version')::integer THEN RAISE EXCEPTION 'Bank transaction changed; reload' USING ERRCODE='40001'; END IF;
    SELECT * INTO stmt FROM btb_bank_statements WHERE id=txn.statement_id FOR UPDATE;
    IF stmt.status='reconciled' THEN RAISE EXCEPTION 'Reopen the statement before changing allocations' USING ERRCODE='40001'; END IF;
    IF p_action='bank_match' THEN
      v_amount:=(p_data->>'amount')::numeric;
      SELECT coalesce(sum(amount),0) INTO allocated FROM btb_bank_allocations WHERE transaction_id=txn.id AND voided_at IS NULL;
      IF v_amount IS NULL OR v_amount<=0 OR allocated+v_amount>abs(txn.amount) THEN RAISE EXCEPTION 'Allocation exceeds remaining bank amount' USING ERRCODE='22023'; END IF;
      IF nullif(p_data->>'invoice_id','') IS NOT NULL THEN
        SELECT * INTO inv FROM btb_invoices WHERE id=(p_data->>'invoice_id')::uuid AND location_id=p_location AND voided_at IS NULL FOR UPDATE;
        IF inv.id IS NULL OR txn.amount>=0 THEN RAISE EXCEPTION 'Outgoing payment and same-location invoice required' USING ERRCODE='42501'; END IF;
        SELECT coalesce(sum(amount),0) INTO paid FROM btb_bank_allocations WHERE invoice_id=inv.id AND voided_at IS NULL;
        IF paid+v_amount>inv.total THEN RAISE EXCEPTION 'Payment exceeds invoice outstanding amount' USING ERRCODE='22023'; END IF;
      END IF;
      INSERT INTO btb_bank_allocations(id,transaction_id,invoice_id,amount,category,notes,created_by)
        VALUES((p_data->>'allocation_id')::uuid,txn.id,inv.id,v_amount,CASE WHEN inv.id IS NULL THEN p_data->>'category' END,coalesce(p_data->>'notes',''),p_actor) RETURNING * INTO allocation;
    ELSE UPDATE btb_bank_allocations SET voided_at=now(),voided_by=p_actor WHERE id=allocation.id; END IF;
    UPDATE btb_bank_transactions SET version=version+1 WHERE id=txn.id;
    UPDATE btb_bank_statements SET version=version+1 WHERE id=stmt.id;
    UPDATE btb_invoices SET version=version+1 WHERE id=allocation.invoice_id;
    PERFORM btb_event(p_location,'bank_allocation',allocation.id,p_action,p_actor,NULL,to_jsonb(allocation),p_data->>'reason');
  ELSIF p_action IN ('bank_finalize','bank_reopen') THEN
    SELECT * INTO stmt FROM btb_bank_statements WHERE id=v_id AND location_id=p_location FOR UPDATE;
    IF stmt.id IS NULL OR stmt.version IS DISTINCT FROM (p_data->>'version')::integer THEN RAISE EXCEPTION 'Statement changed; reload' USING ERRCODE='40001'; END IF;
    IF p_action='bank_finalize' THEN
       IF stmt.status<>'draft' OR NOT stmt.balances_confirmed OR stmt.opening_balance IS NULL OR stmt.closing_balance IS NULL OR stmt.opening_balance+stmt.transaction_total<>stmt.closing_balance THEN
        RAISE EXCEPTION 'Opening plus transactions must equal the verified closing balance' USING ERRCODE='22023'; END IF;
      IF EXISTS(SELECT 1 FROM btb_bank_transactions t WHERE t.statement_id=v_id AND abs(t.amount)<>(SELECT coalesce(sum(a.amount),0) FROM btb_bank_allocations a WHERE a.transaction_id=t.id AND a.voided_at IS NULL)) THEN
        RAISE EXCEPTION 'Every statement transaction must be fully allocated' USING ERRCODE='22023'; END IF;
      UPDATE btb_bank_statements SET status='reconciled',reconciled_at=now(),reconciled_by=p_actor,version=version+1 WHERE id=v_id;
    ELSE
      IF stmt.status<>'reconciled' OR coalesce(trim(p_data->>'reason'),'')='' THEN RAISE EXCEPTION 'Reconciled statement and reopen reason required' USING ERRCODE='22023'; END IF;
      UPDATE btb_bank_statements SET status='draft',reconciled_at=NULL,reconciled_by=NULL,version=version+1 WHERE id=v_id;
    END IF;
    PERFORM btb_event(p_location,'bank_statement',v_id,p_action,p_actor,to_jsonb(stmt)-'raw_csv',NULL,p_data->>'reason');
   ELSIF p_action IN ('gst_save','gst_finalize','gst_reopen','gst_file') THEN
     IF EXISTS(SELECT 1 FROM btb_gst_periods WHERE id=v_id AND location_id<>p_location) THEN RAISE EXCEPTION 'GST period is outside this location' USING ERRCODE='42501'; END IF;
    SELECT * INTO period FROM btb_gst_periods WHERE id=v_id AND location_id=p_location FOR UPDATE;
    IF coalesce(period.version,0) IS DISTINCT FROM (p_data->>'version')::integer THEN RAISE EXCEPTION 'GST period changed; reload' USING ERRCODE='40001'; END IF;
    IF p_action='gst_save' THEN
      IF period.status IS NOT NULL AND period.status<>'draft' THEN RAISE EXCEPTION 'Reopen the GST period first' USING ERRCODE='40001'; END IF;
      v_from:=(p_data->>'from_date')::date; v_to:=(p_data->>'to_date')::date;
      IF EXISTS(SELECT 1 FROM btb_gst_periods WHERE location_id=p_location AND id<>v_id AND status<>'draft' AND from_date<=v_to AND to_date>=v_from) THEN RAISE EXCEPTION 'GST period overlaps a finalized return' USING ERRCODE='40001'; END IF;
      INSERT INTO btb_gst_periods(id,location_id,from_date,to_date,collected,adjustments,purchases_complete,sales_complete,notes,version)
        VALUES(v_id,p_location,v_from,v_to,(p_data->>'collected')::numeric,(p_data->>'adjustments')::numeric,(p_data->>'purchases_complete')::boolean,(p_data->>'sales_complete')::boolean,coalesce(p_data->>'notes',''),coalesce(period.version,0)+1)
        ON CONFLICT(id) DO UPDATE SET from_date=excluded.from_date,to_date=excluded.to_date,collected=excluded.collected,adjustments=excluded.adjustments,
          purchases_complete=excluded.purchases_complete,sales_complete=excluded.sales_complete,notes=excluded.notes,version=excluded.version;
    ELSIF p_action='gst_finalize' THEN
      IF period.id IS NULL OR period.status<>'draft' OR NOT period.purchases_complete OR NOT period.sales_complete OR period.collected IS NULL OR period.adjustments IS NULL THEN RAISE EXCEPTION 'Confirm complete purchases, sales, collected GST and adjustments' USING ERRCODE='22023'; END IF;
      IF EXISTS(SELECT 1 FROM btb_gst_periods WHERE location_id=p_location AND id<>v_id AND status<>'draft' AND from_date<=period.to_date AND to_date>=period.from_date) THEN RAISE EXCEPTION 'GST period overlaps a finalized return' USING ERRCODE='40001'; END IF;
      IF EXISTS(SELECT 1 FROM btb_invoices WHERE location_id=p_location AND invoice_date BETWEEN period.from_date AND period.to_date AND voided_at IS NULL AND NOT tax_confirmed)
        OR EXISTS(SELECT 1 FROM btb_document_imports WHERE location_id=p_location AND kind IN ('gfs','local') AND status='review' AND accounting_month BETWEEN to_char(period.from_date,'YYYY-MM') AND to_char(period.to_date,'YYYY-MM')) THEN
        RAISE EXCEPTION 'Unverified invoice tax or unreviewed purchase documents remain' USING ERRCODE='22023'; END IF;
      SELECT coalesce(sum(gst) FILTER(WHERE itc_eligible),0) INTO input FROM btb_invoices WHERE location_id=p_location AND invoice_date BETWEEN period.from_date AND period.to_date AND voided_at IS NULL;
      UPDATE btb_gst_periods SET input_tax=input,net_due=collected-input+adjustments,status='finalized',finalized_at=now(),finalized_by=p_actor,version=version+1 WHERE id=v_id;
    ELSIF p_action='gst_reopen' THEN
      IF period.id IS NULL OR period.status='draft' OR coalesce(trim(p_data->>'reason'),'')='' THEN RAISE EXCEPTION 'Finalized return and correction reason required' USING ERRCODE='22023'; END IF;
      UPDATE btb_gst_periods SET status='draft',input_tax=NULL,net_due=NULL,filed_on=NULL,filing_reference=NULL,version=version+1 WHERE id=v_id;
    ELSE
      IF period.status IS DISTINCT FROM 'finalized' OR nullif(trim(p_data->>'filing_reference'),'') IS NULL OR (p_data->>'filed_on') IS NULL THEN RAISE EXCEPTION 'Record an actual filing of the finalized return' USING ERRCODE='22023'; END IF;
      UPDATE btb_gst_periods SET status='filed',filed_on=(p_data->>'filed_on')::date,filing_reference=p_data->>'filing_reference',version=version+1 WHERE id=v_id;
    END IF;
    PERFORM btb_event(p_location,'gst_period',v_id,p_action,p_actor,to_jsonb(period),p_data,p_data->>'reason');
  ELSE RAISE EXCEPTION 'Unknown finance action' USING ERRCODE='22023'; END IF;
  INSERT INTO btb_finance_commands(id,actor_id,location_id,action,data,result) VALUES(p_request,p_actor,p_location,p_action,p_data,result);
  RETURN result;
END $$;

CREATE OR REPLACE FUNCTION btb_platform_finance_read(p_actor uuid,p_session integer,p_location uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SET search_path=public AS $$
BEGIN
  PERFORM btb_platform_assert(p_actor,p_session,p_location,'inventory.read');
  RETURN jsonb_build_object(
    'invoices',coalesce((SELECT jsonb_agg(to_jsonb(i)||jsonb_build_object('file_id',d.file_id,'paid',coalesce(a.paid,0),'outstanding',i.total-coalesce(a.paid,0)) ORDER BY i.invoice_date DESC,i.id)
      FROM btb_invoices i JOIN btb_document_imports d ON d.id=i.import_id LEFT JOIN (SELECT invoice_id,sum(amount) paid FROM btb_bank_allocations WHERE voided_at IS NULL GROUP BY invoice_id) a ON a.invoice_id=i.id WHERE i.location_id=p_location),'[]'),
    'accounts',coalesce((SELECT jsonb_agg(to_jsonb(a) ORDER BY name) FROM btb_bank_accounts a WHERE location_id=p_location),'[]'),
    'statements',coalesce((SELECT jsonb_agg(to_jsonb(s)-'raw_csv' ORDER BY from_date DESC,id) FROM btb_bank_statements s WHERE location_id=p_location),'[]'),
    'transactions',coalesce((SELECT jsonb_agg(to_jsonb(t)||jsonb_build_object('allocated',coalesce(a.allocated,0)) ORDER BY t.transaction_date,t.id) FROM btb_bank_transactions t JOIN btb_bank_statements s ON s.id=t.statement_id
      LEFT JOIN (SELECT transaction_id,sum(amount) allocated FROM btb_bank_allocations WHERE voided_at IS NULL GROUP BY transaction_id) a ON a.transaction_id=t.id WHERE s.location_id=p_location),'[]'),
    'allocations',coalesce((SELECT jsonb_agg(to_jsonb(a) ORDER BY a.created_at,a.id) FROM btb_bank_allocations a JOIN btb_bank_transactions t ON t.id=a.transaction_id JOIN btb_bank_statements s ON s.id=t.statement_id WHERE s.location_id=p_location),'[]'),
    'gst_periods',coalesce((SELECT jsonb_agg(to_jsonb(g) ORDER BY from_date DESC) FROM btb_gst_periods g WHERE location_id=p_location),'[]'),
    'stock',coalesce((SELECT jsonb_agg(to_jsonb(i)||jsonb_build_object('balance_version',coalesce(b.version,0),'baseline_at',b.baseline_at,
      'on_hand_packets',CASE WHEN b.baseline_at IS NOT NULL THEN b.opening_packets+coalesce((SELECT sum(packet_delta) FROM btb_stock_movements m WHERE m.item_id=i.id AND m.effective_at>=b.baseline_at),0) END,
      'received_packets',coalesce((SELECT sum(packet_delta) FROM btb_stock_movements m WHERE m.item_id=i.id AND m.kind IN ('receipt','void')),0)) ORDER BY i.name)
      FROM inventory_items i LEFT JOIN btb_stock_balances b ON b.item_id=i.id WHERE i.location_id=p_location),'[]'),
     'prices',coalesce((SELECT jsonb_agg(to_jsonb(h)||jsonb_build_object('voided',p.voided_at IS NOT NULL) ORDER BY h.invoice_date DESC,h.created_at DESC,h.id DESC) FROM btb_supplier_prices h JOIN inventory_purchases p ON p.id=h.purchase_id WHERE h.location_id=p_location),'[]'),
     'movements',coalesce((SELECT jsonb_agg(to_jsonb(m) ORDER BY m.created_at DESC,m.id DESC) FROM btb_stock_movements m WHERE m.location_id=p_location),'[]'),
    'audit',coalesce((SELECT jsonb_agg(jsonb_build_object('id',e.id,'entity_type',e.entity_type,'action',e.action,'actor_name',e.actor_name,'reason',e.reason,'created_at',e.created_at) ORDER BY e.created_at DESC,e.id)
      FROM btb_events e WHERE e.location_id=p_location AND e.entity_type IN ('invoice','stock','bank_account','bank_statement','bank_allocation','gst_period')),'[]')
  );
END $$;

DO $$ DECLARE tab text; f record; BEGIN
  FOREACH tab IN ARRAY ARRAY['btb_invoices','btb_stock_balances','btb_stock_movements','btb_supplier_prices','btb_bank_accounts','btb_bank_statements','btb_bank_transactions','btb_bank_allocations','btb_gst_periods','btb_finance_commands'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY',tab);
    EXECUTE format('REVOKE ALL ON %I FROM PUBLIC,anon,authenticated',tab);
    EXECUTE format('GRANT SELECT,INSERT,UPDATE ON %I TO service_role',tab);
  END LOOP;
  REVOKE UPDATE ON btb_stock_movements,btb_supplier_prices,btb_finance_commands FROM service_role;
  FOR f IN SELECT oid::regprocedure sig FROM pg_proc WHERE pronamespace='public'::regnamespace AND (proname IN ('btb_finance_open_tax','btb_refresh_item_prices','btb_stock_catalogue_version') OR proname LIKE 'btb_platform_%') LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC,anon,authenticated',f.sig);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role',f.sig);
  END LOOP;
END $$;
NOTIFY pgrst,'reload schema';
COMMIT;
