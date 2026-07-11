-- Удаление номеров закупов и документов приёмки (используется только UUID)

ALTER TABLE purchase_orders DROP CONSTRAINT IF EXISTS purchase_orders_number_key;
ALTER TABLE purchase_orders DROP COLUMN IF EXISTS number;

ALTER TABLE receiving_documents DROP CONSTRAINT IF EXISTS receiving_documents_number_key;
ALTER TABLE receiving_documents DROP COLUMN IF EXISTS number;
