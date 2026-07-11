-- Режимы закупа: simple (простая закупка) | analytics (аналитическая)

ALTER TABLE purchase_orders
  ADD COLUMN IF NOT EXISTS workflow_mode TEXT NOT NULL DEFAULT 'analytics'
  CHECK (workflow_mode IN ('simple', 'analytics'));

ALTER TABLE receiving_documents
  ADD COLUMN IF NOT EXISTS workflow_mode TEXT NOT NULL DEFAULT 'analytics'
  CHECK (workflow_mode IN ('simple', 'analytics'));

ALTER TABLE receiving_documents
  ADD COLUMN IF NOT EXISTS total_amount NUMERIC(14, 2) NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_purchase_orders_workflow ON purchase_orders(workflow_mode);
CREATE INDEX IF NOT EXISTS idx_receiving_documents_workflow ON receiving_documents(workflow_mode);
