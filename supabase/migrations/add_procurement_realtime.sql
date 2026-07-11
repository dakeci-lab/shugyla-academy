-- Realtime-синхронизация модуля «Закуп» / «Приёмка»

ALTER TABLE purchase_orders REPLICA IDENTITY FULL;
ALTER TABLE receiving_documents REPLICA IDENTITY FULL;

ALTER TABLE purchase_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE receiving_documents ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow anon read write purchase_orders" ON purchase_orders;
CREATE POLICY "Allow anon read write purchase_orders"
  ON purchase_orders FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow anon read write receiving_documents" ON receiving_documents;
CREATE POLICY "Allow anon read write receiving_documents"
  ON receiving_documents FOR ALL USING (true) WITH CHECK (true);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'purchase_orders'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE purchase_orders;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'receiving_documents'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE receiving_documents;
  END IF;
END $$;
