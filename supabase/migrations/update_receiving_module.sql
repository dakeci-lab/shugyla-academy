-- Расширение таблиц приёмки под полную бизнес-логику «Закуп → Приёмка»

ALTER TABLE receiving_documents
  ADD COLUMN IF NOT EXISTS supplier_id UUID REFERENCES platform_suppliers(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS received_by TEXT,
  ADD COLUMN IF NOT EXISTS received_by_name TEXT,
  ADD COLUMN IF NOT EXISTS total_ordered_qty NUMERIC(12, 3) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS total_received_qty NUMERIC(12, 3) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS total_difference_qty NUMERIC(12, 3) NOT NULL DEFAULT 0;

ALTER TABLE receiving_items
  ADD COLUMN IF NOT EXISTS difference_qty NUMERIC(12, 3) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();

UPDATE receiving_documents SET status = 'awaiting_receiving' WHERE status = 'awaiting';
UPDATE receiving_documents SET status = 'partially_received' WHERE status = 'partial';

ALTER TABLE receiving_documents DROP CONSTRAINT IF EXISTS receiving_documents_status_check;
ALTER TABLE receiving_documents ADD CONSTRAINT receiving_documents_status_check CHECK (status IN (
  'awaiting_receiving', 'in_progress', 'partially_received', 'received', 'cancelled'
));

ALTER TABLE receiving_documents ALTER COLUMN status SET DEFAULT 'awaiting_receiving';

CREATE UNIQUE INDEX IF NOT EXISTS idx_receiving_documents_number ON receiving_documents(number);

COMMENT ON COLUMN receiving_documents.total_ordered_qty IS 'Сумма ordered_qty по позициям';
COMMENT ON COLUMN receiving_documents.total_received_qty IS 'Сумма received_qty по позициям';
COMMENT ON COLUMN receiving_documents.total_difference_qty IS 'total_received_qty - total_ordered_qty';
