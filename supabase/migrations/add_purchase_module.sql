-- Модуль «Закуп» — схема для будущего подключения (пока UI на mock-данных)
-- purchase_orders, purchase_order_items, receiving_documents, receiving_items

CREATE TABLE IF NOT EXISTS purchase_orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  number TEXT NOT NULL UNIQUE,
  date DATE NOT NULL DEFAULT CURRENT_DATE,
  supplier_id UUID REFERENCES suppliers(id) ON DELETE SET NULL,
  supplier_name TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN (
    'draft', 'formed', 'sent', 'awaiting_receiving',
    'partially_received', 'received', 'cancelled'
  )),
  total_amount NUMERIC(14, 2) NOT NULL DEFAULT 0,
  items_count INTEGER NOT NULL DEFAULT 0,
  created_by TEXT,
  created_by_name TEXT,
  expected_delivery_date DATE,
  comment TEXT DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS purchase_order_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  purchase_order_id UUID NOT NULL REFERENCES purchase_orders(id) ON DELETE CASCADE,
  product_name TEXT NOT NULL DEFAULT '',
  barcode TEXT DEFAULT '',
  stock NUMERIC(12, 3) NOT NULL DEFAULT 0,
  sales_per_day NUMERIC(12, 3) NOT NULL DEFAULT 0,
  recommendation NUMERIC(12, 3) NOT NULL DEFAULT 0,
  order_qty NUMERIC(12, 3) NOT NULL DEFAULT 0,
  purchase_price NUMERIC(14, 2) NOT NULL DEFAULT 0,
  line_total NUMERIC(14, 2) NOT NULL DEFAULT 0,
  comment TEXT DEFAULT '',
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_purchase_orders_status ON purchase_orders(status);
CREATE INDEX IF NOT EXISTS idx_purchase_orders_supplier ON purchase_orders(supplier_id);
CREATE INDEX IF NOT EXISTS idx_purchase_order_items_order ON purchase_order_items(purchase_order_id);

CREATE TABLE IF NOT EXISTS receiving_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  purchase_order_id UUID REFERENCES purchase_orders(id) ON DELETE SET NULL,
  number TEXT NOT NULL,
  supplier_name TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'awaiting' CHECK (status IN (
    'awaiting', 'partial', 'received', 'cancelled'
  )),
  expected_delivery_date DATE,
  received_at TIMESTAMPTZ,
  created_by TEXT,
  created_by_name TEXT,
  comment TEXT DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS receiving_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  receiving_document_id UUID NOT NULL REFERENCES receiving_documents(id) ON DELETE CASCADE,
  purchase_order_item_id UUID REFERENCES purchase_order_items(id) ON DELETE SET NULL,
  product_name TEXT NOT NULL DEFAULT '',
  barcode TEXT DEFAULT '',
  ordered_qty NUMERIC(12, 3) NOT NULL DEFAULT 0,
  received_qty NUMERIC(12, 3) NOT NULL DEFAULT 0,
  purchase_price NUMERIC(14, 2) NOT NULL DEFAULT 0,
  comment TEXT DEFAULT '',
  sort_order INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_receiving_documents_purchase ON receiving_documents(purchase_order_id);
CREATE INDEX IF NOT EXISTS idx_receiving_items_document ON receiving_items(receiving_document_id);

COMMENT ON TABLE purchase_orders IS 'Закупочные документы модуля «Закуп»';
COMMENT ON TABLE purchase_order_items IS 'Позиции закупочного документа';
COMMENT ON TABLE receiving_documents IS 'Документы приёмки, создаются из закупов';
COMMENT ON TABLE receiving_items IS 'Позиции документа приёмки';
