-- Seed поставщиков из Umag export
-- Дубликаты по name пропускаются

INSERT INTO platform_suppliers (
  name, legal_name, product_categories, manager_name, manager_phone,
  whatsapp, order_days, delivery_days, min_order_amount, payment_type,
  deferral_days, return_policy, return_comment, responsible_employee_id,
  responsible_employee_name, status, comment
)
SELECT
  'Прима Nivea',
  NULL,
  '{}',
  '',
  '',
  NULL,
  '',
  '',
  0,
  'cash',
  0,
  'no',
  NULL,
  NULL,
  NULL,
  'active',
  'Магазин: Shugyla'
WHERE NOT EXISTS (
  SELECT 1 FROM platform_suppliers WHERE lower(trim(name)) = lower(trim('Прима Nivea'))
);

INSERT INTO platform_suppliers (
  name, legal_name, product_categories, manager_name, manager_phone,
  whatsapp, order_days, delivery_days, min_order_amount, payment_type,
  deferral_days, return_policy, return_comment, responsible_employee_id,
  responsible_employee_name, status, comment
)
SELECT
  'Прима Clear',
  NULL,
  '{}',
  '',
  '',
  NULL,
  '',
  '',
  0,
  'cash',
  0,
  'no',
  NULL,
  NULL,
  NULL,
  'active',
  'Магазин: Shugyla'
WHERE NOT EXISTS (
  SELECT 1 FROM platform_suppliers WHERE lower(trim(name)) = lower(trim('Прима Clear'))
);

INSERT INTO platform_suppliers (
  name, legal_name, product_categories, manager_name, manager_phone,
  whatsapp, order_days, delivery_days, min_order_amount, payment_type,
  deferral_days, return_policy, return_comment, responsible_employee_id,
  responsible_employee_name, status, comment
)
SELECT
  'Прима Доширак',
  NULL,
  '{}',
  '',
  '',
  NULL,
  '',
  '',
  0,
  'cash',
  0,
  'no',
  NULL,
  NULL,
  NULL,
  'active',
  'Магазин: Shugyla'
WHERE NOT EXISTS (
  SELECT 1 FROM platform_suppliers WHERE lower(trim(name)) = lower(trim('Прима Доширак'))
);

INSERT INTO platform_suppliers (
  name, legal_name, product_categories, manager_name, manager_phone,
  whatsapp, order_days, delivery_days, min_order_amount, payment_type,
  deferral_days, return_policy, return_comment, responsible_employee_id,
  responsible_employee_name, status, comment
)
SELECT
  'Алиди Сникерс',
  NULL,
  '{}',
  '',
  '',
  NULL,
  '',
  '',
  0,
  'cash',
  0,
  'no',
  NULL,
  NULL,
  NULL,
  'active',
  'Магазин: Shugyla'
WHERE NOT EXISTS (
  SELECT 1 FROM platform_suppliers WHERE lower(trim(name)) = lower(trim('Алиди Сникерс'))
);

INSERT INTO platform_suppliers (
  name, legal_name, product_categories, manager_name, manager_phone,
  whatsapp, order_days, delivery_days, min_order_amount, payment_type,
  deferral_days, return_policy, return_comment, responsible_employee_id,
  responsible_employee_name, status, comment
)
SELECT
  'Прима Elseve',
  NULL,
  '{}',
  '',
  '',
  NULL,
  '',
  '',
  0,
  'cash',
  0,
  'no',
  NULL,
  NULL,
  NULL,
  'active',
  'Магазин: Shugyla'
WHERE NOT EXISTS (
  SELECT 1 FROM platform_suppliers WHERE lower(trim(name)) = lower(trim('Прима Elseve'))
);

INSERT INTO platform_suppliers (
  name, legal_name, product_categories, manager_name, manager_phone,
  whatsapp, order_days, delivery_days, min_order_amount, payment_type,
  deferral_days, return_policy, return_comment, responsible_employee_id,
  responsible_employee_name, status, comment
)
SELECT
  'Future Trade Company Ред булл',
  NULL,
  '{}',
  '',
  '',
  NULL,
  '',
  '',
  0,
  'cash',
  0,
  'no',
  NULL,
  NULL,
  NULL,
  'active',
  'Магазин: Shugyla'
WHERE NOT EXISTS (
  SELECT 1 FROM platform_suppliers WHERE lower(trim(name)) = lower(trim('Future Trade Company Ред булл'))
);

INSERT INTO platform_suppliers (
  name, legal_name, product_categories, manager_name, manager_phone,
  whatsapp, order_days, delivery_days, min_order_amount, payment_type,
  deferral_days, return_policy, return_comment, responsible_employee_id,
  responsible_employee_name, status, comment
)
SELECT
  'Прима Glade',
  NULL,
  '{}',
  '',
  '',
  NULL,
  '',
  '',
  0,
  'cash',
  0,
  'no',
  NULL,
  NULL,
  NULL,
  'active',
  'Магазин: Shugyla'
WHERE NOT EXISTS (
  SELECT 1 FROM platform_suppliers WHERE lower(trim(name)) = lower(trim('Прима Glade'))
);

INSERT INTO platform_suppliers (
  name, legal_name, product_categories, manager_name, manager_phone,
  whatsapp, order_days, delivery_days, min_order_amount, payment_type,
  deferral_days, return_policy, return_comment, responsible_employee_id,
  responsible_employee_name, status, comment
)
SELECT
  'Прима Colgete',
  NULL,
  '{}',
  '',
  '',
  NULL,
  '',
  '',
  0,
  'cash',
  0,
  'no',
  NULL,
  NULL,
  NULL,
  'active',
  'Магазин: Shugyla'
WHERE NOT EXISTS (
  SELECT 1 FROM platform_suppliers WHERE lower(trim(name)) = lower(trim('Прима Colgete'))
);

INSERT INTO platform_suppliers (
  name, legal_name, product_categories, manager_name, manager_phone,
  whatsapp, order_days, delivery_days, min_order_amount, payment_type,
  deferral_days, return_policy, return_comment, responsible_employee_id,
  responsible_employee_name, status, comment
)
SELECT
  'Прима Маккофе',
  NULL,
  '{}',
  '',
  '',
  NULL,
  '',
  '',
  0,
  'cash',
  0,
  'no',
  NULL,
  NULL,
  NULL,
  'active',
  'Магазин: Shugyla'
WHERE NOT EXISTS (
  SELECT 1 FROM platform_suppliers WHERE lower(trim(name)) = lower(trim('Прима Маккофе'))
);

INSERT INTO platform_suppliers (
  name, legal_name, product_categories, manager_name, manager_phone,
  whatsapp, order_days, delivery_days, min_order_amount, payment_type,
  deferral_days, return_policy, return_comment, responsible_employee_id,
  responsible_employee_name, status, comment
)
SELECT
  'Хоз расходы',
  NULL,
  '{}',
  '',
  '',
  NULL,
  '',
  '',
  0,
  'cash',
  0,
  'no',
  NULL,
  NULL,
  NULL,
  'active',
  'Магазин: Shugyla'
WHERE NOT EXISTS (
  SELECT 1 FROM platform_suppliers WHERE lower(trim(name)) = lower(trim('Хоз расходы'))
);

INSERT INTO platform_suppliers (
  name, legal_name, product_categories, manager_name, manager_phone,
  whatsapp, order_days, delivery_days, min_order_amount, payment_type,
  deferral_days, return_policy, return_comment, responsible_employee_id,
  responsible_employee_name, status, comment
)
SELECT
  'Alidi Snickers',
  NULL,
  '{}',
  '',
  '',
  NULL,
  '',
  '',
  0,
  'cash',
  0,
  'no',
  NULL,
  NULL,
  NULL,
  'active',
  'Магазин: Shugyla'
WHERE NOT EXISTS (
  SELECT 1 FROM platform_suppliers WHERE lower(trim(name)) = lower(trim('Alidi Snickers'))
);

INSERT INTO platform_suppliers (
  name, legal_name, product_categories, manager_name, manager_phone,
  whatsapp, order_days, delivery_days, min_order_amount, payment_type,
  deferral_days, return_policy, return_comment, responsible_employee_id,
  responsible_employee_name, status, comment
)
SELECT
  'Alidi Nestle',
  NULL,
  '{}',
  '',
  '',
  NULL,
  '',
  '',
  0,
  'cash',
  0,
  'no',
  NULL,
  NULL,
  NULL,
  'active',
  'Тип: ИП
Магазин: Shugyla'
WHERE NOT EXISTS (
  SELECT 1 FROM platform_suppliers WHERE lower(trim(name)) = lower(trim('Alidi Nestle'))
);

INSERT INTO platform_suppliers (
  name, legal_name, product_categories, manager_name, manager_phone,
  whatsapp, order_days, delivery_days, min_order_amount, payment_type,
  deferral_days, return_policy, return_comment, responsible_employee_id,
  responsible_employee_name, status, comment
)
SELECT
  'Barbican',
  NULL,
  '{}',
  '',
  '',
  NULL,
  '',
  '',
  0,
  'cash',
  0,
  'no',
  NULL,
  NULL,
  NULL,
  'active',
  'Магазин: Shugyla'
WHERE NOT EXISTS (
  SELECT 1 FROM platform_suppliers WHERE lower(trim(name)) = lower(trim('Barbican'))
);

INSERT INTO platform_suppliers (
  name, legal_name, product_categories, manager_name, manager_phone,
  whatsapp, order_days, delivery_days, min_order_amount, payment_type,
  deferral_days, return_policy, return_comment, responsible_employee_id,
  responsible_employee_name, status, comment
)
SELECT
  'Райян',
  'ИП ТД Райян',
  '{}',
  '',
  '',
  NULL,
  '',
  '',
  0,
  'cash',
  0,
  'no',
  NULL,
  NULL,
  NULL,
  'active',
  'Тип: ИП
ИИН/БИН: 840215300589
Магазин: Shugyla'
WHERE NOT EXISTS (
  SELECT 1 FROM platform_suppliers WHERE lower(trim(name)) = lower(trim('Райян'))
);

INSERT INTO platform_suppliers (
  name, legal_name, product_categories, manager_name, manager_phone,
  whatsapp, order_days, delivery_days, min_order_amount, payment_type,
  deferral_days, return_policy, return_comment, responsible_employee_id,
  responsible_employee_name, status, comment
)
SELECT
  'Фуд Мастер',
  'ТОО PILOT PLUS',
  '{}',
  '',
  '',
  NULL,
  '',
  '',
  0,
  'cash',
  0,
  'no',
  NULL,
  NULL,
  NULL,
  'active',
  'Тип: ТОО
ИИН/БИН: 111240010267
Магазин: Shugyla'
WHERE NOT EXISTS (
  SELECT 1 FROM platform_suppliers WHERE lower(trim(name)) = lower(trim('Фуд Мастер'))
);

INSERT INTO platform_suppliers (
  name, legal_name, product_categories, manager_name, manager_phone,
  whatsapp, order_days, delivery_days, min_order_amount, payment_type,
  deferral_days, return_policy, return_comment, responsible_employee_id,
  responsible_employee_name, status, comment
)
SELECT
  'Ак Алтын',
  'ТОО LF Company',
  '{}',
  '',
  '',
  NULL,
  '',
  '',
  0,
  'cash',
  0,
  'no',
  NULL,
  NULL,
  NULL,
  'active',
  'Тип: ТОО
ИИН/БИН: 161140015749
Магазин: Shugyla'
WHERE NOT EXISTS (
  SELECT 1 FROM platform_suppliers WHERE lower(trim(name)) = lower(trim('Ак Алтын'))
);

INSERT INTO platform_suppliers (
  name, legal_name, product_categories, manager_name, manager_phone,
  whatsapp, order_days, delivery_days, min_order_amount, payment_type,
  deferral_days, return_policy, return_comment, responsible_employee_id,
  responsible_employee_name, status, comment
)
SELECT
  'Тассай',
  'ТОО Юг Трейд Групп',
  '{}',
  '',
  '',
  NULL,
  '',
  '',
  0,
  'cash',
  0,
  'no',
  NULL,
  NULL,
  NULL,
  'active',
  'Тип: ТОО
ИИН/БИН: 250940003265
Магазин: Shugyla'
WHERE NOT EXISTS (
  SELECT 1 FROM platform_suppliers WHERE lower(trim(name)) = lower(trim('Тассай'))
);

INSERT INTO platform_suppliers (
  name, legal_name, product_categories, manager_name, manager_phone,
  whatsapp, order_days, delivery_days, min_order_amount, payment_type,
  deferral_days, return_policy, return_comment, responsible_employee_id,
  responsible_employee_name, status, comment
)
SELECT
  'Future Trade Company',
  'ТОО Future Trade Company',
  '{}',
  '',
  '',
  NULL,
  '',
  '',
  0,
  'cash',
  0,
  'no',
  NULL,
  NULL,
  NULL,
  'active',
  'Тип: ТОО
ИИН/БИН: 180341034283
Магазин: Shugyla'
WHERE NOT EXISTS (
  SELECT 1 FROM platform_suppliers WHERE lower(trim(name)) = lower(trim('Future Trade Company'))
);

INSERT INTO platform_suppliers (
  name, legal_name, product_categories, manager_name, manager_phone,
  whatsapp, order_days, delivery_days, min_order_amount, payment_type,
  deferral_days, return_policy, return_comment, responsible_employee_id,
  responsible_employee_name, status, comment
)
SELECT
  'TVIV',
  'ИП Танеев',
  '{}',
  '',
  '',
  NULL,
  '',
  '',
  0,
  'cash',
  0,
  'no',
  NULL,
  NULL,
  NULL,
  'active',
  'Тип: ИП
ИИН/БИН: 640728302205
Магазин: Shugyla
Адрес: г Шымкент Площадка Цемзавода здание 26'
WHERE NOT EXISTS (
  SELECT 1 FROM platform_suppliers WHERE lower(trim(name)) = lower(trim('TVIV'))
);

INSERT INTO platform_suppliers (
  name, legal_name, product_categories, manager_name, manager_phone,
  whatsapp, order_days, delivery_days, min_order_amount, payment_type,
  deferral_days, return_policy, return_comment, responsible_employee_id,
  responsible_employee_name, status, comment
)
SELECT
  'Данияр Продукты',
  NULL,
  '{}',
  '',
  '+7 (778) 801-31-51',
  NULL,
  '',
  '',
  0,
  'cash',
  0,
  'no',
  NULL,
  NULL,
  NULL,
  'active',
  'Магазин: Shugyla'
WHERE NOT EXISTS (
  SELECT 1 FROM platform_suppliers WHERE lower(trim(name)) = lower(trim('Данияр Продукты'))
);

INSERT INTO platform_suppliers (
  name, legal_name, product_categories, manager_name, manager_phone,
  whatsapp, order_days, delivery_days, min_order_amount, payment_type,
  deferral_days, return_policy, return_comment, responsible_employee_id,
  responsible_employee_name, status, comment
)
SELECT
  'Колбаса',
  NULL,
  '{}',
  '',
  '',
  NULL,
  '',
  '',
  0,
  'cash',
  0,
  'no',
  NULL,
  NULL,
  NULL,
  'active',
  'Магазин: Shugyla'
WHERE NOT EXISTS (
  SELECT 1 FROM platform_suppliers WHERE lower(trim(name)) = lower(trim('Колбаса'))
);

INSERT INTO platform_suppliers (
  name, legal_name, product_categories, manager_name, manager_phone,
  whatsapp, order_days, delivery_days, min_order_amount, payment_type,
  deferral_days, return_policy, return_comment, responsible_employee_id,
  responsible_employee_name, status, comment
)
SELECT
  'Списания',
  NULL,
  '{}',
  '',
  '',
  NULL,
  '',
  '',
  0,
  'cash',
  0,
  'no',
  NULL,
  NULL,
  NULL,
  'active',
  'Магазин: Shugyla'
WHERE NOT EXISTS (
  SELECT 1 FROM platform_suppliers WHERE lower(trim(name)) = lower(trim('Списания'))
);

INSERT INTO platform_suppliers (
  name, legal_name, product_categories, manager_name, manager_phone,
  whatsapp, order_days, delivery_days, min_order_amount, payment_type,
  deferral_days, return_policy, return_comment, responsible_employee_id,
  responsible_employee_name, status, comment
)
SELECT
  'LVR Asia',
  'ТОО LVR Asia',
  '{}',
  '',
  '',
  NULL,
  '',
  '',
  0,
  'cash',
  0,
  'no',
  NULL,
  NULL,
  NULL,
  'active',
  'Тип: ТОО
ИИН/БИН: 130240014786
Магазин: Shugyla'
WHERE NOT EXISTS (
  SELECT 1 FROM platform_suppliers WHERE lower(trim(name)) = lower(trim('LVR Asia'))
);

INSERT INTO platform_suppliers (
  name, legal_name, product_categories, manager_name, manager_phone,
  whatsapp, order_days, delivery_days, min_order_amount, payment_type,
  deferral_days, return_policy, return_comment, responsible_employee_id,
  responsible_employee_name, status, comment
)
SELECT
  'Арахис Dazi',
  NULL,
  '{}',
  '',
  '',
  NULL,
  '',
  '',
  0,
  'cash',
  0,
  'no',
  NULL,
  NULL,
  NULL,
  'active',
  'Магазин: Shugyla'
WHERE NOT EXISTS (
  SELECT 1 FROM platform_suppliers WHERE lower(trim(name)) = lower(trim('Арахис Dazi'))
);

INSERT INTO platform_suppliers (
  name, legal_name, product_categories, manager_name, manager_phone,
  whatsapp, order_days, delivery_days, min_order_amount, payment_type,
  deferral_days, return_policy, return_comment, responsible_employee_id,
  responsible_employee_name, status, comment
)
SELECT
  'RG Brands',
  NULL,
  '{}',
  '',
  '',
  NULL,
  '',
  '',
  0,
  'cash',
  0,
  'no',
  NULL,
  NULL,
  NULL,
  'active',
  'Магазин: Shugyla'
WHERE NOT EXISTS (
  SELECT 1 FROM platform_suppliers WHERE lower(trim(name)) = lower(trim('RG Brands'))
);

INSERT INTO platform_suppliers (
  name, legal_name, product_categories, manager_name, manager_phone,
  whatsapp, order_days, delivery_days, min_order_amount, payment_type,
  deferral_days, return_policy, return_comment, responsible_employee_id,
  responsible_employee_name, status, comment
)
SELECT
  'Кесек',
  NULL,
  '{}',
  '',
  '',
  NULL,
  '',
  '',
  0,
  'cash',
  0,
  'no',
  NULL,
  NULL,
  NULL,
  'active',
  'Тип: ИП
Магазин: Shugyla'
WHERE NOT EXISTS (
  SELECT 1 FROM platform_suppliers WHERE lower(trim(name)) = lower(trim('Кесек'))
);

INSERT INTO platform_suppliers (
  name, legal_name, product_categories, manager_name, manager_phone,
  whatsapp, order_days, delivery_days, min_order_amount, payment_type,
  deferral_days, return_policy, return_comment, responsible_employee_id,
  responsible_employee_name, status, comment
)
SELECT
  'Рахат Лукум',
  NULL,
  '{}',
  '',
  '',
  NULL,
  '',
  '',
  0,
  'cash',
  0,
  'no',
  NULL,
  NULL,
  NULL,
  'active',
  'Магазин: Shugyla'
WHERE NOT EXISTS (
  SELECT 1 FROM platform_suppliers WHERE lower(trim(name)) = lower(trim('Рахат Лукум'))
);

INSERT INTO platform_suppliers (
  name, legal_name, product_categories, manager_name, manager_phone,
  whatsapp, order_days, delivery_days, min_order_amount, payment_type,
  deferral_days, return_policy, return_comment, responsible_employee_id,
  responsible_employee_name, status, comment
)
SELECT
  'Квас От Розы',
  NULL,
  '{}',
  '',
  '',
  NULL,
  '',
  '',
  0,
  'cash',
  0,
  'no',
  NULL,
  NULL,
  NULL,
  'active',
  'Магазин: Shugyla'
WHERE NOT EXISTS (
  SELECT 1 FROM platform_suppliers WHERE lower(trim(name)) = lower(trim('Квас От Розы'))
);

INSERT INTO platform_suppliers (
  name, legal_name, product_categories, manager_name, manager_phone,
  whatsapp, order_days, delivery_days, min_order_amount, payment_type,
  deferral_days, return_policy, return_comment, responsible_employee_id,
  responsible_employee_name, status, comment
)
SELECT
  'Мадлен',
  NULL,
  '{}',
  '',
  '',
  NULL,
  '',
  '',
  0,
  'cash',
  0,
  'no',
  NULL,
  NULL,
  NULL,
  'active',
  'Магазин: Shugyla'
WHERE NOT EXISTS (
  SELECT 1 FROM platform_suppliers WHERE lower(trim(name)) = lower(trim('Мадлен'))
);

INSERT INTO platform_suppliers (
  name, legal_name, product_categories, manager_name, manager_phone,
  whatsapp, order_days, delivery_days, min_order_amount, payment_type,
  deferral_days, return_policy, return_comment, responsible_employee_id,
  responsible_employee_name, status, comment
)
SELECT
  'Мир Сладости',
  NULL,
  '{}',
  '',
  '',
  NULL,
  '',
  '',
  0,
  'cash',
  0,
  'no',
  NULL,
  NULL,
  NULL,
  'active',
  'Магазин: Shugyla'
WHERE NOT EXISTS (
  SELECT 1 FROM platform_suppliers WHERE lower(trim(name)) = lower(trim('Мир Сладости'))
);

INSERT INTO platform_suppliers (
  name, legal_name, product_categories, manager_name, manager_phone,
  whatsapp, order_days, delivery_days, min_order_amount, payment_type,
  deferral_days, return_policy, return_comment, responsible_employee_id,
  responsible_employee_name, status, comment
)
SELECT
  'Аян Сэндвич',
  NULL,
  '{}',
  '',
  '',
  NULL,
  '',
  '',
  0,
  'cash',
  0,
  'no',
  NULL,
  NULL,
  NULL,
  'active',
  'Магазин: Shugyla'
WHERE NOT EXISTS (
  SELECT 1 FROM platform_suppliers WHERE lower(trim(name)) = lower(trim('Аян Сэндвич'))
);

INSERT INTO platform_suppliers (
  name, legal_name, product_categories, manager_name, manager_phone,
  whatsapp, order_days, delivery_days, min_order_amount, payment_type,
  deferral_days, return_policy, return_comment, responsible_employee_id,
  responsible_employee_name, status, comment
)
SELECT
  'Лакомка Мансур',
  NULL,
  '{}',
  '',
  '',
  NULL,
  '',
  '',
  0,
  'cash',
  0,
  'no',
  NULL,
  NULL,
  NULL,
  'active',
  'Магазин: Shugyla'
WHERE NOT EXISTS (
  SELECT 1 FROM platform_suppliers WHERE lower(trim(name)) = lower(trim('Лакомка Мансур'))
);

INSERT INTO platform_suppliers (
  name, legal_name, product_categories, manager_name, manager_phone,
  whatsapp, order_days, delivery_days, min_order_amount, payment_type,
  deferral_days, return_policy, return_comment, responsible_employee_id,
  responsible_employee_name, status, comment
)
SELECT
  'Вода Samal',
  NULL,
  '{}',
  '',
  '',
  NULL,
  '',
  '',
  0,
  'cash',
  0,
  'no',
  NULL,
  NULL,
  NULL,
  'active',
  'Магазин: Shugyla'
WHERE NOT EXISTS (
  SELECT 1 FROM platform_suppliers WHERE lower(trim(name)) = lower(trim('Вода Samal'))
);

INSERT INTO platform_suppliers (
  name, legal_name, product_categories, manager_name, manager_phone,
  whatsapp, order_days, delivery_days, min_order_amount, payment_type,
  deferral_days, return_policy, return_comment, responsible_employee_id,
  responsible_employee_name, status, comment
)
SELECT
  'Boho курт',
  NULL,
  '{}',
  '',
  '',
  NULL,
  '',
  '',
  0,
  'cash',
  0,
  'no',
  NULL,
  NULL,
  NULL,
  'active',
  'Магазин: Shugyla'
WHERE NOT EXISTS (
  SELECT 1 FROM platform_suppliers WHERE lower(trim(name)) = lower(trim('Boho курт'))
);

INSERT INTO platform_suppliers (
  name, legal_name, product_categories, manager_name, manager_phone,
  whatsapp, order_days, delivery_days, min_order_amount, payment_type,
  deferral_days, return_policy, return_comment, responsible_employee_id,
  responsible_employee_name, status, comment
)
SELECT
  'Чупс Гулжан',
  NULL,
  '{}',
  '',
  '',
  NULL,
  '',
  '',
  0,
  'cash',
  0,
  'no',
  NULL,
  NULL,
  NULL,
  'active',
  'Магазин: Shugyla'
WHERE NOT EXISTS (
  SELECT 1 FROM platform_suppliers WHERE lower(trim(name)) = lower(trim('Чупс Гулжан'))
);

INSERT INTO platform_suppliers (
  name, legal_name, product_categories, manager_name, manager_phone,
  whatsapp, order_days, delivery_days, min_order_amount, payment_type,
  deferral_days, return_policy, return_comment, responsible_employee_id,
  responsible_employee_name, status, comment
)
SELECT
  'Нарлен',
  'ТОО Қарқын-2030',
  '{}',
  '',
  '',
  NULL,
  '',
  '',
  0,
  'cash',
  0,
  'no',
  NULL,
  NULL,
  NULL,
  'active',
  'Тип: ТОО
ИИН/БИН: 090340016260
Магазин: Shugyla'
WHERE NOT EXISTS (
  SELECT 1 FROM platform_suppliers WHERE lower(trim(name)) = lower(trim('Нарлен'))
);

INSERT INTO platform_suppliers (
  name, legal_name, product_categories, manager_name, manager_phone,
  whatsapp, order_days, delivery_days, min_order_amount, payment_type,
  deferral_days, return_policy, return_comment, responsible_employee_id,
  responsible_employee_name, status, comment
)
SELECT
  'Алихан Ата',
  'ИП Алихан Ата',
  '{}',
  '',
  '',
  NULL,
  '',
  '',
  0,
  'cash',
  0,
  'no',
  NULL,
  NULL,
  NULL,
  'active',
  'Тип: ИП
ИИН/БИН: 660919300121
Магазин: Shugyla'
WHERE NOT EXISTS (
  SELECT 1 FROM platform_suppliers WHERE lower(trim(name)) = lower(trim('Алихан Ата'))
);

INSERT INTO platform_suppliers (
  name, legal_name, product_categories, manager_name, manager_phone,
  whatsapp, order_days, delivery_days, min_order_amount, payment_type,
  deferral_days, return_policy, return_comment, responsible_employee_id,
  responsible_employee_name, status, comment
)
SELECT
  'Восточный базар',
  'ИП Восточный базар',
  '{}',
  '',
  '',
  NULL,
  '',
  '',
  0,
  'cash',
  0,
  'no',
  NULL,
  NULL,
  NULL,
  'active',
  'Тип: ИП
ИИН/БИН: 770812300083
Магазин: Shugyla
Адрес: Шымкент Пшеничных дом 55'
WHERE NOT EXISTS (
  SELECT 1 FROM platform_suppliers WHERE lower(trim(name)) = lower(trim('Восточный базар'))
);

INSERT INTO platform_suppliers (
  name, legal_name, product_categories, manager_name, manager_phone,
  whatsapp, order_days, delivery_days, min_order_amount, payment_type,
  deferral_days, return_policy, return_comment, responsible_employee_id,
  responsible_employee_name, status, comment
)
SELECT
  'Хлебобулочные',
  NULL,
  '{}',
  '',
  '',
  NULL,
  '',
  '',
  0,
  'cash',
  0,
  'no',
  NULL,
  NULL,
  NULL,
  'active',
  'Магазин: Shugyla'
WHERE NOT EXISTS (
  SELECT 1 FROM platform_suppliers WHERE lower(trim(name)) = lower(trim('Хлебобулочные'))
);

INSERT INTO platform_suppliers (
  name, legal_name, product_categories, manager_name, manager_phone,
  whatsapp, order_days, delivery_days, min_order_amount, payment_type,
  deferral_days, return_policy, return_comment, responsible_employee_id,
  responsible_employee_name, status, comment
)
SELECT
  'Конти',
  NULL,
  '{}',
  '',
  '',
  NULL,
  '',
  '',
  0,
  'cash',
  0,
  'no',
  NULL,
  NULL,
  NULL,
  'active',
  'Магазин: Shugyla'
WHERE NOT EXISTS (
  SELECT 1 FROM platform_suppliers WHERE lower(trim(name)) = lower(trim('Конти'))
);

INSERT INTO platform_suppliers (
  name, legal_name, product_categories, manager_name, manager_phone,
  whatsapp, order_days, delivery_days, min_order_amount, payment_type,
  deferral_days, return_policy, return_comment, responsible_employee_id,
  responsible_employee_name, status, comment
)
SELECT
  'Пиндодо',
  NULL,
  '{}',
  '',
  '',
  NULL,
  '',
  '',
  0,
  'cash',
  0,
  'no',
  NULL,
  NULL,
  NULL,
  'active',
  'Магазин: Shugyla'
WHERE NOT EXISTS (
  SELECT 1 FROM platform_suppliers WHERE lower(trim(name)) = lower(trim('Пиндодо'))
);

INSERT INTO platform_suppliers (
  name, legal_name, product_categories, manager_name, manager_phone,
  whatsapp, order_days, delivery_days, min_order_amount, payment_type,
  deferral_days, return_policy, return_comment, responsible_employee_id,
  responsible_employee_name, status, comment
)
SELECT
  'BGT Company',
  'ТОО BGT Company',
  '{}',
  '',
  '',
  NULL,
  '',
  '',
  0,
  'cash',
  0,
  'no',
  NULL,
  NULL,
  NULL,
  'active',
  'Тип: ТОО
ИИН/БИН: 231140008672
Магазин: Shugyla'
WHERE NOT EXISTS (
  SELECT 1 FROM platform_suppliers WHERE lower(trim(name)) = lower(trim('BGT Company'))
);

INSERT INTO platform_suppliers (
  name, legal_name, product_categories, manager_name, manager_phone,
  whatsapp, order_days, delivery_days, min_order_amount, payment_type,
  deferral_days, return_policy, return_comment, responsible_employee_id,
  responsible_employee_name, status, comment
)
SELECT
  'Бурже',
  NULL,
  '{}',
  '',
  '',
  NULL,
  '',
  '',
  0,
  'cash',
  0,
  'no',
  NULL,
  NULL,
  NULL,
  'active',
  'Магазин: Shugyla'
WHERE NOT EXISTS (
  SELECT 1 FROM platform_suppliers WHERE lower(trim(name)) = lower(trim('Бурже'))
);

INSERT INTO platform_suppliers (
  name, legal_name, product_categories, manager_name, manager_phone,
  whatsapp, order_days, delivery_days, min_order_amount, payment_type,
  deferral_days, return_policy, return_comment, responsible_employee_id,
  responsible_employee_name, status, comment
)
SELECT
  'Барака',
  'ИП Барака',
  '{}',
  '',
  '',
  NULL,
  '',
  '',
  0,
  'cash',
  0,
  'no',
  NULL,
  NULL,
  NULL,
  'active',
  'Тип: ИП
ИИН/БИН: 900415301344
Магазин: Shugyla'
WHERE NOT EXISTS (
  SELECT 1 FROM platform_suppliers WHERE lower(trim(name)) = lower(trim('Барака'))
);

INSERT INTO platform_suppliers (
  name, legal_name, product_categories, manager_name, manager_phone,
  whatsapp, order_days, delivery_days, min_order_amount, payment_type,
  deferral_days, return_policy, return_comment, responsible_employee_id,
  responsible_employee_name, status, comment
)
SELECT
  'СПК товары',
  'АО Социально-предпринимательская корпорация "Туркестан"',
  '{}',
  '',
  '',
  NULL,
  '',
  '',
  0,
  'cash',
  0,
  'no',
  NULL,
  NULL,
  NULL,
  'active',
  'Тип: AO
ИИН/БИН: 110740015540
Магазин: Shugyla'
WHERE NOT EXISTS (
  SELECT 1 FROM platform_suppliers WHERE lower(trim(name)) = lower(trim('СПК товары'))
);

INSERT INTO platform_suppliers (
  name, legal_name, product_categories, manager_name, manager_phone,
  whatsapp, order_days, delivery_days, min_order_amount, payment_type,
  deferral_days, return_policy, return_comment, responsible_employee_id,
  responsible_employee_name, status, comment
)
SELECT
  'Жулдыз Суши',
  NULL,
  '{}',
  '',
  '',
  NULL,
  '',
  '',
  0,
  'cash',
  0,
  'no',
  NULL,
  NULL,
  NULL,
  'active',
  'Магазин: Shugyla'
WHERE NOT EXISTS (
  SELECT 1 FROM platform_suppliers WHERE lower(trim(name)) = lower(trim('Жулдыз Суши'))
);

INSERT INTO platform_suppliers (
  name, legal_name, product_categories, manager_name, manager_phone,
  whatsapp, order_days, delivery_days, min_order_amount, payment_type,
  deferral_days, return_policy, return_comment, responsible_employee_id,
  responsible_employee_name, status, comment
)
SELECT
  'Перепелиные яйца',
  NULL,
  '{}',
  '',
  '',
  NULL,
  '',
  '',
  0,
  'cash',
  0,
  'no',
  NULL,
  NULL,
  NULL,
  'active',
  'Магазин: Shugyla'
WHERE NOT EXISTS (
  SELECT 1 FROM platform_suppliers WHERE lower(trim(name)) = lower(trim('Перепелиные яйца'))
);

INSERT INTO platform_suppliers (
  name, legal_name, product_categories, manager_name, manager_phone,
  whatsapp, order_days, delivery_days, min_order_amount, payment_type,
  deferral_days, return_policy, return_comment, responsible_employee_id,
  responsible_employee_name, status, comment
)
SELECT
  'Айгуль Блины',
  NULL,
  '{}',
  '',
  '',
  NULL,
  '',
  '',
  0,
  'cash',
  0,
  'no',
  NULL,
  NULL,
  NULL,
  'active',
  'Магазин: Shugyla'
WHERE NOT EXISTS (
  SELECT 1 FROM platform_suppliers WHERE lower(trim(name)) = lower(trim('Айгуль Блины'))
);

INSERT INTO platform_suppliers (
  name, legal_name, product_categories, manager_name, manager_phone,
  whatsapp, order_days, delivery_days, min_order_amount, payment_type,
  deferral_days, return_policy, return_comment, responsible_employee_id,
  responsible_employee_name, status, comment
)
SELECT
  'Абдулахат Булочка',
  NULL,
  '{}',
  '',
  '',
  NULL,
  '',
  '',
  0,
  'cash',
  0,
  'no',
  NULL,
  NULL,
  NULL,
  'active',
  'Магазин: Shugyla'
WHERE NOT EXISTS (
  SELECT 1 FROM platform_suppliers WHERE lower(trim(name)) = lower(trim('Абдулахат Булочка'))
);

INSERT INTO platform_suppliers (
  name, legal_name, product_categories, manager_name, manager_phone,
  whatsapp, order_days, delivery_days, min_order_amount, payment_type,
  deferral_days, return_policy, return_comment, responsible_employee_id,
  responsible_employee_name, status, comment
)
SELECT
  'Желен',
  NULL,
  '{}',
  '',
  '',
  NULL,
  '',
  '',
  0,
  'cash',
  0,
  'no',
  NULL,
  NULL,
  NULL,
  'active',
  'Магазин: Shugyla'
WHERE NOT EXISTS (
  SELECT 1 FROM platform_suppliers WHERE lower(trim(name)) = lower(trim('Желен'))
);

INSERT INTO platform_suppliers (
  name, legal_name, product_categories, manager_name, manager_phone,
  whatsapp, order_days, delivery_days, min_order_amount, payment_type,
  deferral_days, return_policy, return_comment, responsible_employee_id,
  responsible_employee_name, status, comment
)
SELECT
  'Шинлайн',
  'ИП Таншолпан',
  '{}',
  '',
  '',
  NULL,
  '',
  '',
  0,
  'cash',
  0,
  'no',
  NULL,
  NULL,
  NULL,
  'active',
  'Тип: ИП
ИИН/БИН: 940516401858
Магазин: Shugyla'
WHERE NOT EXISTS (
  SELECT 1 FROM platform_suppliers WHERE lower(trim(name)) = lower(trim('Шинлайн'))
);

INSERT INTO platform_suppliers (
  name, legal_name, product_categories, manager_name, manager_phone,
  whatsapp, order_days, delivery_days, min_order_amount, payment_type,
  deferral_days, return_policy, return_comment, responsible_employee_id,
  responsible_employee_name, status, comment
)
SELECT
  'Ник торт',
  NULL,
  '{}',
  '',
  '',
  NULL,
  '',
  '',
  0,
  'cash',
  0,
  'no',
  NULL,
  NULL,
  NULL,
  'active',
  'Магазин: Shugyla'
WHERE NOT EXISTS (
  SELECT 1 FROM platform_suppliers WHERE lower(trim(name)) = lower(trim('Ник торт'))
);

INSERT INTO platform_suppliers (
  name, legal_name, product_categories, manager_name, manager_phone,
  whatsapp, order_days, delivery_days, min_order_amount, payment_type,
  deferral_days, return_policy, return_comment, responsible_employee_id,
  responsible_employee_name, status, comment
)
SELECT
  'Вкуспродукт',
  'ИП ДӘМДІ ӨНІМ',
  '{}',
  '',
  '',
  NULL,
  '',
  '',
  0,
  'cash',
  0,
  'no',
  NULL,
  NULL,
  NULL,
  'active',
  'Тип: ИП
ИИН/БИН: 730317301599
Магазин: Shugyla'
WHERE NOT EXISTS (
  SELECT 1 FROM platform_suppliers WHERE lower(trim(name)) = lower(trim('Вкуспродукт'))
);

INSERT INTO platform_suppliers (
  name, legal_name, product_categories, manager_name, manager_phone,
  whatsapp, order_days, delivery_days, min_order_amount, payment_type,
  deferral_days, return_policy, return_comment, responsible_employee_id,
  responsible_employee_name, status, comment
)
SELECT
  'Розметов колбаса',
  NULL,
  '{}',
  '',
  '',
  NULL,
  '',
  '',
  0,
  'cash',
  0,
  'no',
  NULL,
  NULL,
  NULL,
  'active',
  'Магазин: Shugyla'
WHERE NOT EXISTS (
  SELECT 1 FROM platform_suppliers WHERE lower(trim(name)) = lower(trim('Розметов колбаса'))
);

INSERT INTO platform_suppliers (
  name, legal_name, product_categories, manager_name, manager_phone,
  whatsapp, order_days, delivery_days, min_order_amount, payment_type,
  deferral_days, return_policy, return_comment, responsible_employee_id,
  responsible_employee_name, status, comment
)
SELECT
  'Алматинское',
  'ТОО PAT & CO',
  '{}',
  '',
  '',
  NULL,
  '',
  '',
  0,
  'cash',
  0,
  'no',
  NULL,
  NULL,
  NULL,
  'active',
  'Тип: ТОО
ИИН/БИН: 030840007060
Магазин: Shugyla'
WHERE NOT EXISTS (
  SELECT 1 FROM platform_suppliers WHERE lower(trim(name)) = lower(trim('Алматинское'))
);

INSERT INTO platform_suppliers (
  name, legal_name, product_categories, manager_name, manager_phone,
  whatsapp, order_days, delivery_days, min_order_amount, payment_type,
  deferral_days, return_policy, return_comment, responsible_employee_id,
  responsible_employee_name, status, comment
)
SELECT
  'Мелло',
  NULL,
  '{}',
  '',
  '',
  NULL,
  '',
  '',
  0,
  'cash',
  0,
  'no',
  NULL,
  NULL,
  NULL,
  'active',
  'Магазин: Shugyla'
WHERE NOT EXISTS (
  SELECT 1 FROM platform_suppliers WHERE lower(trim(name)) = lower(trim('Мелло'))
);

INSERT INTO platform_suppliers (
  name, legal_name, product_categories, manager_name, manager_phone,
  whatsapp, order_days, delivery_days, min_order_amount, payment_type,
  deferral_days, return_policy, return_comment, responsible_employee_id,
  responsible_employee_name, status, comment
)
SELECT
  'Булка Батон',
  NULL,
  '{}',
  '',
  '',
  NULL,
  '',
  '',
  0,
  'cash',
  0,
  'no',
  NULL,
  NULL,
  NULL,
  'active',
  'Магазин: Shugyla'
WHERE NOT EXISTS (
  SELECT 1 FROM platform_suppliers WHERE lower(trim(name)) = lower(trim('Булка Батон'))
);

INSERT INTO platform_suppliers (
  name, legal_name, product_categories, manager_name, manager_phone,
  whatsapp, order_days, delivery_days, min_order_amount, payment_type,
  deferral_days, return_policy, return_comment, responsible_employee_id,
  responsible_employee_name, status, comment
)
SELECT
  'Яйцо',
  NULL,
  '{}',
  '',
  '',
  NULL,
  '',
  '',
  0,
  'cash',
  0,
  'no',
  NULL,
  NULL,
  NULL,
  'active',
  'Магазин: Shugyla'
WHERE NOT EXISTS (
  SELECT 1 FROM platform_suppliers WHERE lower(trim(name)) = lower(trim('Яйцо'))
);

INSERT INTO platform_suppliers (
  name, legal_name, product_categories, manager_name, manager_phone,
  whatsapp, order_days, delivery_days, min_order_amount, payment_type,
  deferral_days, return_policy, return_comment, responsible_employee_id,
  responsible_employee_name, status, comment
)
SELECT
  'Баян Сулу',
  NULL,
  '{}',
  '',
  '',
  NULL,
  '',
  '',
  0,
  'cash',
  0,
  'no',
  NULL,
  NULL,
  NULL,
  'active',
  'Магазин: Shugyla'
WHERE NOT EXISTS (
  SELECT 1 FROM platform_suppliers WHERE lower(trim(name)) = lower(trim('Баян Сулу'))
);

INSERT INTO platform_suppliers (
  name, legal_name, product_categories, manager_name, manager_phone,
  whatsapp, order_days, delivery_days, min_order_amount, payment_type,
  deferral_days, return_policy, return_comment, responsible_employee_id,
  responsible_employee_name, status, comment
)
SELECT
  'Фрукты, Овощи',
  NULL,
  '{}',
  '',
  '',
  NULL,
  '',
  '',
  0,
  'cash',
  0,
  'no',
  NULL,
  NULL,
  NULL,
  'active',
  'Магазин: Shugyla'
WHERE NOT EXISTS (
  SELECT 1 FROM platform_suppliers WHERE lower(trim(name)) = lower(trim('Фрукты, Овощи'))
);

INSERT INTO platform_suppliers (
  name, legal_name, product_categories, manager_name, manager_phone,
  whatsapp, order_days, delivery_days, min_order_amount, payment_type,
  deferral_days, return_policy, return_comment, responsible_employee_id,
  responsible_employee_name, status, comment
)
SELECT
  'Apple City Corps',
  NULL,
  '{}',
  '',
  '',
  NULL,
  '',
  '',
  0,
  'cash',
  0,
  'no',
  NULL,
  NULL,
  NULL,
  'active',
  'Магазин: Shugyla'
WHERE NOT EXISTS (
  SELECT 1 FROM platform_suppliers WHERE lower(trim(name)) = lower(trim('Apple City Corps'))
);

INSERT INTO platform_suppliers (
  name, legal_name, product_categories, manager_name, manager_phone,
  whatsapp, order_days, delivery_days, min_order_amount, payment_type,
  deferral_days, return_policy, return_comment, responsible_employee_id,
  responsible_employee_name, status, comment
)
SELECT
  'Самса Домаш',
  NULL,
  '{}',
  '',
  '',
  NULL,
  '',
  '',
  0,
  'cash',
  0,
  'no',
  NULL,
  NULL,
  NULL,
  'active',
  'Магазин: Shugyla'
WHERE NOT EXISTS (
  SELECT 1 FROM platform_suppliers WHERE lower(trim(name)) = lower(trim('Самса Домаш'))
);

INSERT INTO platform_suppliers (
  name, legal_name, product_categories, manager_name, manager_phone,
  whatsapp, order_days, delivery_days, min_order_amount, payment_type,
  deferral_days, return_policy, return_comment, responsible_employee_id,
  responsible_employee_name, status, comment
)
SELECT
  'Дузенова',
  'ИП Дузенова',
  '{}',
  '',
  '',
  NULL,
  '',
  '',
  0,
  'cash',
  0,
  'no',
  NULL,
  NULL,
  NULL,
  'active',
  'Тип: ИП
ИИН/БИН: 910618401044
Магазин: Shugyla'
WHERE NOT EXISTS (
  SELECT 1 FROM platform_suppliers WHERE lower(trim(name)) = lower(trim('Дузенова'))
);

INSERT INTO platform_suppliers (
  name, legal_name, product_categories, manager_name, manager_phone,
  whatsapp, order_days, delivery_days, min_order_amount, payment_type,
  deferral_days, return_policy, return_comment, responsible_employee_id,
  responsible_employee_name, status, comment
)
SELECT
  'Прима Дистрибьюшн',
  NULL,
  '{}',
  '',
  '',
  NULL,
  '',
  '',
  0,
  'cash',
  0,
  'no',
  NULL,
  NULL,
  NULL,
  'active',
  'Магазин: Shugyla'
WHERE NOT EXISTS (
  SELECT 1 FROM platform_suppliers WHERE lower(trim(name)) = lower(trim('Прима Дистрибьюшн'))
);

INSERT INTO platform_suppliers (
  name, legal_name, product_categories, manager_name, manager_phone,
  whatsapp, order_days, delivery_days, min_order_amount, payment_type,
  deferral_days, return_policy, return_comment, responsible_employee_id,
  responsible_employee_name, status, comment
)
SELECT
  'Шокпарлы',
  NULL,
  '{}',
  '',
  '',
  NULL,
  '',
  '',
  0,
  'cash',
  0,
  'no',
  NULL,
  NULL,
  NULL,
  'active',
  'Магазин: Shugyla'
WHERE NOT EXISTS (
  SELECT 1 FROM platform_suppliers WHERE lower(trim(name)) = lower(trim('Шокпарлы'))
);

INSERT INTO platform_suppliers (
  name, legal_name, product_categories, manager_name, manager_phone,
  whatsapp, order_days, delivery_days, min_order_amount, payment_type,
  deferral_days, return_policy, return_comment, responsible_employee_id,
  responsible_employee_name, status, comment
)
SELECT
  'София',
  NULL,
  '{}',
  '',
  '',
  NULL,
  '',
  '',
  0,
  'cash',
  0,
  'no',
  NULL,
  NULL,
  NULL,
  'active',
  'Магазин: Shugyla'
WHERE NOT EXISTS (
  SELECT 1 FROM platform_suppliers WHERE lower(trim(name)) = lower(trim('София'))
);

INSERT INTO platform_suppliers (
  name, legal_name, product_categories, manager_name, manager_phone,
  whatsapp, order_days, delivery_days, min_order_amount, payment_type,
  deferral_days, return_policy, return_comment, responsible_employee_id,
  responsible_employee_name, status, comment
)
SELECT
  'Базар',
  NULL,
  '{}',
  '',
  '',
  NULL,
  '',
  '',
  0,
  'cash',
  0,
  'no',
  NULL,
  NULL,
  NULL,
  'active',
  'Магазин: Shugyla'
WHERE NOT EXISTS (
  SELECT 1 FROM platform_suppliers WHERE lower(trim(name)) = lower(trim('Базар'))
);

INSERT INTO platform_suppliers (
  name, legal_name, product_categories, manager_name, manager_phone,
  whatsapp, order_days, delivery_days, min_order_amount, payment_type,
  deferral_days, return_policy, return_comment, responsible_employee_id,
  responsible_employee_name, status, comment
)
SELECT
  'Аль Тамир чай',
  NULL,
  '{}',
  '',
  '',
  NULL,
  '',
  '',
  0,
  'cash',
  0,
  'no',
  NULL,
  NULL,
  NULL,
  'active',
  'Магазин: Shugyla'
WHERE NOT EXISTS (
  SELECT 1 FROM platform_suppliers WHERE lower(trim(name)) = lower(trim('Аль Тамир чай'))
);

INSERT INTO platform_suppliers (
  name, legal_name, product_categories, manager_name, manager_phone,
  whatsapp, order_days, delivery_days, min_order_amount, payment_type,
  deferral_days, return_policy, return_comment, responsible_employee_id,
  responsible_employee_name, status, comment
)
SELECT
  'Борте',
  NULL,
  '{}',
  '',
  '',
  NULL,
  '',
  '',
  0,
  'cash',
  0,
  'no',
  NULL,
  NULL,
  NULL,
  'active',
  'Магазин: Shugyla'
WHERE NOT EXISTS (
  SELECT 1 FROM platform_suppliers WHERE lower(trim(name)) = lower(trim('Борте'))
);

INSERT INTO platform_suppliers (
  name, legal_name, product_categories, manager_name, manager_phone,
  whatsapp, order_days, delivery_days, min_order_amount, payment_type,
  deferral_days, return_policy, return_comment, responsible_employee_id,
  responsible_employee_name, status, comment
)
SELECT
  'Сайрам нан',
  NULL,
  '{}',
  '',
  '',
  NULL,
  '',
  '',
  0,
  'cash',
  0,
  'no',
  NULL,
  NULL,
  NULL,
  'active',
  'Магазин: Shugyla'
WHERE NOT EXISTS (
  SELECT 1 FROM platform_suppliers WHERE lower(trim(name)) = lower(trim('Сайрам нан'))
);

INSERT INTO platform_suppliers (
  name, legal_name, product_categories, manager_name, manager_phone,
  whatsapp, order_days, delivery_days, min_order_amount, payment_type,
  deferral_days, return_policy, return_comment, responsible_employee_id,
  responsible_employee_name, status, comment
)
SELECT
  'Салат Назира',
  NULL,
  '{}',
  '',
  '',
  NULL,
  '',
  '',
  0,
  'cash',
  0,
  'no',
  NULL,
  NULL,
  NULL,
  'active',
  'Магазин: Shugyla'
WHERE NOT EXISTS (
  SELECT 1 FROM platform_suppliers WHERE lower(trim(name)) = lower(trim('Салат Назира'))
);

INSERT INTO platform_suppliers (
  name, legal_name, product_categories, manager_name, manager_phone,
  whatsapp, order_days, delivery_days, min_order_amount, payment_type,
  deferral_days, return_policy, return_comment, responsible_employee_id,
  responsible_employee_name, status, comment
)
SELECT
  'Бостан',
  'ТОО Бостан',
  '{}',
  '',
  '',
  NULL,
  '',
  '',
  0,
  'cash',
  0,
  'no',
  NULL,
  NULL,
  NULL,
  'active',
  'Тип: ТОО
ИИН/БИН: 010441000358
Магазин: Shugyla'
WHERE NOT EXISTS (
  SELECT 1 FROM platform_suppliers WHERE lower(trim(name)) = lower(trim('Бостан'))
);

INSERT INTO platform_suppliers (
  name, legal_name, product_categories, manager_name, manager_phone,
  whatsapp, order_days, delivery_days, min_order_amount, payment_type,
  deferral_days, return_policy, return_comment, responsible_employee_id,
  responsible_employee_name, status, comment
)
SELECT
  'Пирожки',
  NULL,
  '{}',
  '',
  '',
  NULL,
  '',
  '',
  0,
  'cash',
  0,
  'no',
  NULL,
  NULL,
  NULL,
  'active',
  'Магазин: Shugyla'
WHERE NOT EXISTS (
  SELECT 1 FROM platform_suppliers WHERE lower(trim(name)) = lower(trim('Пирожки'))
);

INSERT INTO platform_suppliers (
  name, legal_name, product_categories, manager_name, manager_phone,
  whatsapp, order_days, delivery_days, min_order_amount, payment_type,
  deferral_days, return_policy, return_comment, responsible_employee_id,
  responsible_employee_name, status, comment
)
SELECT
  'Дамды',
  NULL,
  '{}',
  '',
  '',
  NULL,
  '',
  '',
  0,
  'cash',
  0,
  'no',
  NULL,
  NULL,
  NULL,
  'active',
  'Магазин: Shugyla'
WHERE NOT EXISTS (
  SELECT 1 FROM platform_suppliers WHERE lower(trim(name)) = lower(trim('Дамды'))
);

INSERT INTO platform_suppliers (
  name, legal_name, product_categories, manager_name, manager_phone,
  whatsapp, order_days, delivery_days, min_order_amount, payment_type,
  deferral_days, return_policy, return_comment, responsible_employee_id,
  responsible_employee_name, status, comment
)
SELECT
  'Наргила Черепаха',
  NULL,
  '{}',
  '',
  '',
  NULL,
  '',
  '',
  0,
  'cash',
  0,
  'no',
  NULL,
  NULL,
  NULL,
  'active',
  'Магазин: Shugyla'
WHERE NOT EXISTS (
  SELECT 1 FROM platform_suppliers WHERE lower(trim(name)) = lower(trim('Наргила Черепаха'))
);

INSERT INTO platform_suppliers (
  name, legal_name, product_categories, manager_name, manager_phone,
  whatsapp, order_days, delivery_days, min_order_amount, payment_type,
  deferral_days, return_policy, return_comment, responsible_employee_id,
  responsible_employee_name, status, comment
)
SELECT
  'Хлебы Асем',
  NULL,
  '{}',
  '',
  '',
  NULL,
  '',
  '',
  0,
  'cash',
  0,
  'no',
  NULL,
  NULL,
  NULL,
  'active',
  'Магазин: Shugyla'
WHERE NOT EXISTS (
  SELECT 1 FROM platform_suppliers WHERE lower(trim(name)) = lower(trim('Хлебы Асем'))
);

INSERT INTO platform_suppliers (
  name, legal_name, product_categories, manager_name, manager_phone,
  whatsapp, order_days, delivery_days, min_order_amount, payment_type,
  deferral_days, return_policy, return_comment, responsible_employee_id,
  responsible_employee_name, status, comment
)
SELECT
  'Болат колбаса',
  NULL,
  '{}',
  '',
  '',
  NULL,
  '',
  '',
  0,
  'cash',
  0,
  'no',
  NULL,
  NULL,
  NULL,
  'active',
  'Магазин: Shugyla'
WHERE NOT EXISTS (
  SELECT 1 FROM platform_suppliers WHERE lower(trim(name)) = lower(trim('Болат колбаса'))
);

INSERT INTO platform_suppliers (
  name, legal_name, product_categories, manager_name, manager_phone,
  whatsapp, order_days, delivery_days, min_order_amount, payment_type,
  deferral_days, return_policy, return_comment, responsible_employee_id,
  responsible_employee_name, status, comment
)
SELECT
  'TOO GD',
  NULL,
  '{}',
  '',
  '',
  NULL,
  '',
  '',
  0,
  'cash',
  0,
  'no',
  NULL,
  NULL,
  NULL,
  'active',
  'Магазин: Shugyla'
WHERE NOT EXISTS (
  SELECT 1 FROM platform_suppliers WHERE lower(trim(name)) = lower(trim('TOO GD'))
);

INSERT INTO platform_suppliers (
  name, legal_name, product_categories, manager_name, manager_phone,
  whatsapp, order_days, delivery_days, min_order_amount, payment_type,
  deferral_days, return_policy, return_comment, responsible_employee_id,
  responsible_employee_name, status, comment
)
SELECT
  'Жанабай Самса',
  NULL,
  '{}',
  '',
  '',
  NULL,
  '',
  '',
  0,
  'cash',
  0,
  'no',
  NULL,
  NULL,
  NULL,
  'active',
  'Магазин: Shugyla'
WHERE NOT EXISTS (
  SELECT 1 FROM platform_suppliers WHERE lower(trim(name)) = lower(trim('Жанабай Самса'))
);

INSERT INTO platform_suppliers (
  name, legal_name, product_categories, manager_name, manager_phone,
  whatsapp, order_days, delivery_days, min_order_amount, payment_type,
  deferral_days, return_policy, return_comment, responsible_employee_id,
  responsible_employee_name, status, comment
)
SELECT
  'Сут Дима',
  NULL,
  '{}',
  '',
  '',
  NULL,
  '',
  '',
  0,
  'cash',
  0,
  'no',
  NULL,
  NULL,
  NULL,
  'active',
  'Магазин: Shugyla'
WHERE NOT EXISTS (
  SELECT 1 FROM platform_suppliers WHERE lower(trim(name)) = lower(trim('Сут Дима'))
);

INSERT INTO platform_suppliers (
  name, legal_name, product_categories, manager_name, manager_phone,
  whatsapp, order_days, delivery_days, min_order_amount, payment_type,
  deferral_days, return_policy, return_comment, responsible_employee_id,
  responsible_employee_name, status, comment
)
SELECT
  'Айдар Коже',
  NULL,
  '{}',
  '',
  '',
  NULL,
  '',
  '',
  0,
  'cash',
  0,
  'no',
  NULL,
  NULL,
  NULL,
  'active',
  'Магазин: Shugyla'
WHERE NOT EXISTS (
  SELECT 1 FROM platform_suppliers WHERE lower(trim(name)) = lower(trim('Айдар Коже'))
);

INSERT INTO platform_suppliers (
  name, legal_name, product_categories, manager_name, manager_phone,
  whatsapp, order_days, delivery_days, min_order_amount, payment_type,
  deferral_days, return_policy, return_comment, responsible_employee_id,
  responsible_employee_name, status, comment
)
SELECT
  'Азамат',
  NULL,
  '{}',
  '',
  '',
  NULL,
  '',
  '',
  0,
  'cash',
  0,
  'no',
  NULL,
  NULL,
  NULL,
  'active',
  'Магазин: Shugyla'
WHERE NOT EXISTS (
  SELECT 1 FROM platform_suppliers WHERE lower(trim(name)) = lower(trim('Азамат'))
);

INSERT INTO platform_suppliers (
  name, legal_name, product_categories, manager_name, manager_phone,
  whatsapp, order_days, delivery_days, min_order_amount, payment_type,
  deferral_days, return_policy, return_comment, responsible_employee_id,
  responsible_employee_name, status, comment
)
SELECT
  'Тайиба',
  NULL,
  '{}',
  '',
  '',
  NULL,
  '',
  '',
  0,
  'cash',
  0,
  'no',
  NULL,
  NULL,
  NULL,
  'active',
  'Магазин: Shugyla'
WHERE NOT EXISTS (
  SELECT 1 FROM platform_suppliers WHERE lower(trim(name)) = lower(trim('Тайиба'))
);

INSERT INTO platform_suppliers (
  name, legal_name, product_categories, manager_name, manager_phone,
  whatsapp, order_days, delivery_days, min_order_amount, payment_type,
  deferral_days, return_policy, return_comment, responsible_employee_id,
  responsible_employee_name, status, comment
)
SELECT
  'Салат Гулчехра',
  NULL,
  '{}',
  '',
  '',
  NULL,
  '',
  '',
  0,
  'cash',
  0,
  'no',
  NULL,
  NULL,
  NULL,
  'active',
  'Магазин: Shugyla'
WHERE NOT EXISTS (
  SELECT 1 FROM platform_suppliers WHERE lower(trim(name)) = lower(trim('Салат Гулчехра'))
);

INSERT INTO platform_suppliers (
  name, legal_name, product_categories, manager_name, manager_phone,
  whatsapp, order_days, delivery_days, min_order_amount, payment_type,
  deferral_days, return_policy, return_comment, responsible_employee_id,
  responsible_employee_name, status, comment
)
SELECT
  'Ленгерское',
  'ИП Lengerskoe в Туркестане',
  '{}',
  '',
  '+7 (707) 965-99-99',
  NULL,
  '',
  '',
  0,
  'cash',
  0,
  'no',
  NULL,
  NULL,
  NULL,
  'active',
  'Тип: ИП
ИИН/БИН: 870416300021
Магазин: Shugyla
Адрес: Туркестанская область, село Орангай, Кв-л 41, уч. 6218'
WHERE NOT EXISTS (
  SELECT 1 FROM platform_suppliers WHERE lower(trim(name)) = lower(trim('Ленгерское'))
);

INSERT INTO platform_suppliers (
  name, legal_name, product_categories, manager_name, manager_phone,
  whatsapp, order_days, delivery_days, min_order_amount, payment_type,
  deferral_days, return_policy, return_comment, responsible_employee_id,
  responsible_employee_name, status, comment
)
SELECT
  'Хан таттилери',
  NULL,
  '{}',
  '',
  '',
  NULL,
  '',
  '',
  0,
  'cash',
  0,
  'no',
  NULL,
  NULL,
  NULL,
  'active',
  'Магазин: Shugyla'
WHERE NOT EXISTS (
  SELECT 1 FROM platform_suppliers WHERE lower(trim(name)) = lower(trim('Хан таттилери'))
);

INSERT INTO platform_suppliers (
  name, legal_name, product_categories, manager_name, manager_phone,
  whatsapp, order_days, delivery_days, min_order_amount, payment_type,
  deferral_days, return_policy, return_comment, responsible_employee_id,
  responsible_employee_name, status, comment
)
SELECT
  'Окорочка',
  NULL,
  '{}',
  '',
  '',
  NULL,
  '',
  '',
  0,
  'cash',
  0,
  'no',
  NULL,
  NULL,
  NULL,
  'active',
  'Магазин: Shugyla'
WHERE NOT EXISTS (
  SELECT 1 FROM platform_suppliers WHERE lower(trim(name)) = lower(trim('Окорочка'))
);

INSERT INTO platform_suppliers (
  name, legal_name, product_categories, manager_name, manager_phone,
  whatsapp, order_days, delivery_days, min_order_amount, payment_type,
  deferral_days, return_policy, return_comment, responsible_employee_id,
  responsible_employee_name, status, comment
)
SELECT
  'Милкарт',
  NULL,
  '{}',
  '',
  '',
  NULL,
  '',
  '',
  0,
  'cash',
  0,
  'no',
  NULL,
  NULL,
  NULL,
  'active',
  'Магазин: Shugyla'
WHERE NOT EXISTS (
  SELECT 1 FROM platform_suppliers WHERE lower(trim(name)) = lower(trim('Милкарт'))
);

INSERT INTO platform_suppliers (
  name, legal_name, product_categories, manager_name, manager_phone,
  whatsapp, order_days, delivery_days, min_order_amount, payment_type,
  deferral_days, return_policy, return_comment, responsible_employee_id,
  responsible_employee_name, status, comment
)
SELECT
  'Омега Моющие',
  'ИП Ихсанов Феликс',
  '{}',
  '',
  '',
  NULL,
  '',
  '',
  0,
  'cash',
  0,
  'no',
  NULL,
  NULL,
  NULL,
  'active',
  'Тип: ИП
ИИН/БИН: 050407550853
Магазин: Shugyla'
WHERE NOT EXISTS (
  SELECT 1 FROM platform_suppliers WHERE lower(trim(name)) = lower(trim('Омега Моющие'))
);

INSERT INTO platform_suppliers (
  name, legal_name, product_categories, manager_name, manager_phone,
  whatsapp, order_days, delivery_days, min_order_amount, payment_type,
  deferral_days, return_policy, return_comment, responsible_employee_id,
  responsible_employee_name, status, comment
)
SELECT
  'KDV Казахстан',
  'ТОО KDV Казахстан',
  '{}',
  '',
  '',
  NULL,
  '',
  '',
  0,
  'cash',
  0,
  'no',
  NULL,
  NULL,
  NULL,
  'active',
  'Тип: ТОО
ИИН/БИН: 041240000988
Магазин: Shugyla'
WHERE NOT EXISTS (
  SELECT 1 FROM platform_suppliers WHERE lower(trim(name)) = lower(trim('KDV Казахстан'))
);

INSERT INTO platform_suppliers (
  name, legal_name, product_categories, manager_name, manager_phone,
  whatsapp, order_days, delivery_days, min_order_amount, payment_type,
  deferral_days, return_policy, return_comment, responsible_employee_id,
  responsible_employee_name, status, comment
)
SELECT
  'Авто Товары',
  NULL,
  '{}',
  '',
  '',
  NULL,
  '',
  '',
  0,
  'cash',
  0,
  'no',
  NULL,
  NULL,
  NULL,
  'active',
  'Магазин: Shugyla'
WHERE NOT EXISTS (
  SELECT 1 FROM platform_suppliers WHERE lower(trim(name)) = lower(trim('Авто Товары'))
);

INSERT INTO platform_suppliers (
  name, legal_name, product_categories, manager_name, manager_phone,
  whatsapp, order_days, delivery_days, min_order_amount, payment_type,
  deferral_days, return_policy, return_comment, responsible_employee_id,
  responsible_employee_name, status, comment
)
SELECT
  'Халифа пряник',
  NULL,
  '{}',
  '',
  '',
  NULL,
  '',
  '',
  0,
  'cash',
  0,
  'no',
  NULL,
  NULL,
  NULL,
  'active',
  'Магазин: Shugyla'
WHERE NOT EXISTS (
  SELECT 1 FROM platform_suppliers WHERE lower(trim(name)) = lower(trim('Халифа пряник'))
);

INSERT INTO platform_suppliers (
  name, legal_name, product_categories, manager_name, manager_phone,
  whatsapp, order_days, delivery_days, min_order_amount, payment_type,
  deferral_days, return_policy, return_comment, responsible_employee_id,
  responsible_employee_name, status, comment
)
SELECT
  'Макси Чай',
  NULL,
  '{}',
  '',
  '',
  NULL,
  '',
  '',
  0,
  'cash',
  0,
  'no',
  NULL,
  NULL,
  NULL,
  'active',
  'Магазин: Shugyla'
WHERE NOT EXISTS (
  SELECT 1 FROM platform_suppliers WHERE lower(trim(name)) = lower(trim('Макси Чай'))
);

INSERT INTO platform_suppliers (
  name, legal_name, product_categories, manager_name, manager_phone,
  whatsapp, order_days, delivery_days, min_order_amount, payment_type,
  deferral_days, return_policy, return_comment, responsible_employee_id,
  responsible_employee_name, status, comment
)
SELECT
  'Юг сладости',
  NULL,
  '{}',
  '',
  '',
  NULL,
  '',
  '',
  0,
  'cash',
  0,
  'no',
  NULL,
  NULL,
  NULL,
  'active',
  'Магазин: Shugyla'
WHERE NOT EXISTS (
  SELECT 1 FROM platform_suppliers WHERE lower(trim(name)) = lower(trim('Юг сладости'))
);

INSERT INTO platform_suppliers (
  name, legal_name, product_categories, manager_name, manager_phone,
  whatsapp, order_days, delivery_days, min_order_amount, payment_type,
  deferral_days, return_policy, return_comment, responsible_employee_id,
  responsible_employee_name, status, comment
)
SELECT
  'Каусар пряники',
  NULL,
  '{}',
  '',
  '',
  NULL,
  '',
  '',
  0,
  'cash',
  0,
  'no',
  NULL,
  NULL,
  NULL,
  'active',
  'Магазин: Shugyla'
WHERE NOT EXISTS (
  SELECT 1 FROM platform_suppliers WHERE lower(trim(name)) = lower(trim('Каусар пряники'))
);

INSERT INTO platform_suppliers (
  name, legal_name, product_categories, manager_name, manager_phone,
  whatsapp, order_days, delivery_days, min_order_amount, payment_type,
  deferral_days, return_policy, return_comment, responsible_employee_id,
  responsible_employee_name, status, comment
)
SELECT
  'Галактика ЛАК',
  NULL,
  '{}',
  '',
  '',
  NULL,
  '',
  '',
  0,
  'cash',
  0,
  'no',
  NULL,
  NULL,
  NULL,
  'active',
  'Магазин: Shugyla'
WHERE NOT EXISTS (
  SELECT 1 FROM platform_suppliers WHERE lower(trim(name)) = lower(trim('Галактика ЛАК'))
);

INSERT INTO platform_suppliers (
  name, legal_name, product_categories, manager_name, manager_phone,
  whatsapp, order_days, delivery_days, min_order_amount, payment_type,
  deferral_days, return_policy, return_comment, responsible_employee_id,
  responsible_employee_name, status, comment
)
SELECT
  'Рахат',
  NULL,
  '{}',
  '',
  '',
  NULL,
  '',
  '',
  0,
  'cash',
  0,
  'no',
  NULL,
  NULL,
  NULL,
  'active',
  'Магазин: Shugyla'
WHERE NOT EXISTS (
  SELECT 1 FROM platform_suppliers WHERE lower(trim(name)) = lower(trim('Рахат'))
);

INSERT INTO platform_suppliers (
  name, legal_name, product_categories, manager_name, manager_phone,
  whatsapp, order_days, delivery_days, min_order_amount, payment_type,
  deferral_days, return_policy, return_comment, responsible_employee_id,
  responsible_employee_name, status, comment
)
SELECT
  'Джинн',
  NULL,
  '{}',
  '',
  '',
  NULL,
  '',
  '',
  0,
  'cash',
  0,
  'no',
  NULL,
  NULL,
  NULL,
  'active',
  'Магазин: Shugyla'
WHERE NOT EXISTS (
  SELECT 1 FROM platform_suppliers WHERE lower(trim(name)) = lower(trim('Джинн'))
);

INSERT INTO platform_suppliers (
  name, legal_name, product_categories, manager_name, manager_phone,
  whatsapp, order_days, delivery_days, min_order_amount, payment_type,
  deferral_days, return_policy, return_comment, responsible_employee_id,
  responsible_employee_name, status, comment
)
SELECT
  'Олжас Пряник',
  NULL,
  '{}',
  '',
  '',
  NULL,
  '',
  '',
  0,
  'cash',
  0,
  'no',
  NULL,
  NULL,
  NULL,
  'active',
  'Магазин: Shugyla'
WHERE NOT EXISTS (
  SELECT 1 FROM platform_suppliers WHERE lower(trim(name)) = lower(trim('Олжас Пряник'))
);

INSERT INTO platform_suppliers (
  name, legal_name, product_categories, manager_name, manager_phone,
  whatsapp, order_days, delivery_days, min_order_amount, payment_type,
  deferral_days, return_policy, return_comment, responsible_employee_id,
  responsible_employee_name, status, comment
)
SELECT
  'Дариоль',
  'ТОО ТД Дариоль.KZ',
  '{}',
  '',
  '',
  NULL,
  '',
  '',
  0,
  'cash',
  0,
  'no',
  NULL,
  NULL,
  NULL,
  'active',
  'Тип: ТОО
ИИН/БИН: 160740024043
Магазин: Shugyla'
WHERE NOT EXISTS (
  SELECT 1 FROM platform_suppliers WHERE lower(trim(name)) = lower(trim('Дариоль'))
);

INSERT INTO platform_suppliers (
  name, legal_name, product_categories, manager_name, manager_phone,
  whatsapp, order_days, delivery_days, min_order_amount, payment_type,
  deferral_days, return_policy, return_comment, responsible_employee_id,
  responsible_employee_name, status, comment
)
SELECT
  'Базар Шико',
  NULL,
  '{}',
  '',
  '',
  NULL,
  '',
  '',
  0,
  'cash',
  0,
  'no',
  NULL,
  NULL,
  NULL,
  'active',
  'Магазин: Shugyla'
WHERE NOT EXISTS (
  SELECT 1 FROM platform_suppliers WHERE lower(trim(name)) = lower(trim('Базар Шико'))
);

INSERT INTO platform_suppliers (
  name, legal_name, product_categories, manager_name, manager_phone,
  whatsapp, order_days, delivery_days, min_order_amount, payment_type,
  deferral_days, return_policy, return_comment, responsible_employee_id,
  responsible_employee_name, status, comment
)
SELECT
  'Отау',
  NULL,
  '{}',
  '',
  '',
  NULL,
  '',
  '',
  0,
  'cash',
  0,
  'no',
  NULL,
  NULL,
  NULL,
  'active',
  'Магазин: Shugyla'
WHERE NOT EXISTS (
  SELECT 1 FROM platform_suppliers WHERE lower(trim(name)) = lower(trim('Отау'))
);

INSERT INTO platform_suppliers (
  name, legal_name, product_categories, manager_name, manager_phone,
  whatsapp, order_days, delivery_days, min_order_amount, payment_type,
  deferral_days, return_policy, return_comment, responsible_employee_id,
  responsible_employee_name, status, comment
)
SELECT
  'Майлыкент',
  NULL,
  '{}',
  '',
  '',
  NULL,
  '',
  '',
  0,
  'cash',
  0,
  'no',
  NULL,
  NULL,
  NULL,
  'active',
  'Магазин: Shugyla'
WHERE NOT EXISTS (
  SELECT 1 FROM platform_suppliers WHERE lower(trim(name)) = lower(trim('Майлыкент'))
);

INSERT INTO platform_suppliers (
  name, legal_name, product_categories, manager_name, manager_phone,
  whatsapp, order_days, delivery_days, min_order_amount, payment_type,
  deferral_days, return_policy, return_comment, responsible_employee_id,
  responsible_employee_name, status, comment
)
SELECT
  'Радник',
  NULL,
  '{}',
  '',
  '',
  NULL,
  '',
  '',
  0,
  'cash',
  0,
  'no',
  NULL,
  NULL,
  NULL,
  'active',
  'Магазин: Shugyla'
WHERE NOT EXISTS (
  SELECT 1 FROM platform_suppliers WHERE lower(trim(name)) = lower(trim('Радник'))
);

INSERT INTO platform_suppliers (
  name, legal_name, product_categories, manager_name, manager_phone,
  whatsapp, order_days, delivery_days, min_order_amount, payment_type,
  deferral_days, return_policy, return_comment, responsible_employee_id,
  responsible_employee_name, status, comment
)
SELECT
  'Полуфабрикат Акнур',
  NULL,
  '{}',
  '',
  '',
  NULL,
  '',
  '',
  0,
  'cash',
  0,
  'no',
  NULL,
  NULL,
  NULL,
  'active',
  'Магазин: Shugyla'
WHERE NOT EXISTS (
  SELECT 1 FROM platform_suppliers WHERE lower(trim(name)) = lower(trim('Полуфабрикат Акнур'))
);

INSERT INTO platform_suppliers (
  name, legal_name, product_categories, manager_name, manager_phone,
  whatsapp, order_days, delivery_days, min_order_amount, payment_type,
  deferral_days, return_policy, return_comment, responsible_employee_id,
  responsible_employee_name, status, comment
)
SELECT
  'Шымкент құс',
  NULL,
  '{}',
  '',
  '',
  NULL,
  '',
  '',
  0,
  'cash',
  0,
  'no',
  NULL,
  NULL,
  NULL,
  'active',
  'Магазин: Shugyla'
WHERE NOT EXISTS (
  SELECT 1 FROM platform_suppliers WHERE lower(trim(name)) = lower(trim('Шымкент құс'))
);

INSERT INTO platform_suppliers (
  name, legal_name, product_categories, manager_name, manager_phone,
  whatsapp, order_days, delivery_days, min_order_amount, payment_type,
  deferral_days, return_policy, return_comment, responsible_employee_id,
  responsible_employee_name, status, comment
)
SELECT
  'Салат',
  NULL,
  '{}',
  '',
  '',
  NULL,
  '',
  '',
  0,
  'cash',
  0,
  'no',
  NULL,
  NULL,
  NULL,
  'active',
  'Магазин: Shugyla'
WHERE NOT EXISTS (
  SELECT 1 FROM platform_suppliers WHERE lower(trim(name)) = lower(trim('Салат'))
);

INSERT INTO platform_suppliers (
  name, legal_name, product_categories, manager_name, manager_phone,
  whatsapp, order_days, delivery_days, min_order_amount, payment_type,
  deferral_days, return_policy, return_comment, responsible_employee_id,
  responsible_employee_name, status, comment
)
SELECT
  'Проктер',
  NULL,
  '{}',
  '',
  '',
  NULL,
  '',
  '',
  0,
  'cash',
  0,
  'no',
  NULL,
  NULL,
  NULL,
  'active',
  'Магазин: Shugyla'
WHERE NOT EXISTS (
  SELECT 1 FROM platform_suppliers WHERE lower(trim(name)) = lower(trim('Проктер'))
);

INSERT INTO platform_suppliers (
  name, legal_name, product_categories, manager_name, manager_phone,
  whatsapp, order_days, delivery_days, min_order_amount, payment_type,
  deferral_days, return_policy, return_comment, responsible_employee_id,
  responsible_employee_name, status, comment
)
SELECT
  'Горилла',
  NULL,
  '{}',
  '',
  '',
  NULL,
  '',
  '',
  0,
  'cash',
  0,
  'no',
  NULL,
  NULL,
  NULL,
  'active',
  'Магазин: Shugyla'
WHERE NOT EXISTS (
  SELECT 1 FROM platform_suppliers WHERE lower(trim(name)) = lower(trim('Горилла'))
);

INSERT INTO platform_suppliers (
  name, legal_name, product_categories, manager_name, manager_phone,
  whatsapp, order_days, delivery_days, min_order_amount, payment_type,
  deferral_days, return_policy, return_comment, responsible_employee_id,
  responsible_employee_name, status, comment
)
SELECT
  'Гаухар',
  NULL,
  '{}',
  '',
  '',
  NULL,
  '',
  '',
  0,
  'cash',
  0,
  'no',
  NULL,
  NULL,
  NULL,
  'active',
  'Магазин: Shugyla'
WHERE NOT EXISTS (
  SELECT 1 FROM platform_suppliers WHERE lower(trim(name)) = lower(trim('Гаухар'))
);

INSERT INTO platform_suppliers (
  name, legal_name, product_categories, manager_name, manager_phone,
  whatsapp, order_days, delivery_days, min_order_amount, payment_type,
  deferral_days, return_policy, return_comment, responsible_employee_id,
  responsible_employee_name, status, comment
)
SELECT
  'Визит',
  NULL,
  '{}',
  '',
  '',
  NULL,
  '',
  '',
  0,
  'cash',
  0,
  'no',
  NULL,
  NULL,
  NULL,
  'active',
  'Магазин: Shugyla'
WHERE NOT EXISTS (
  SELECT 1 FROM platform_suppliers WHERE lower(trim(name)) = lower(trim('Визит'))
);

INSERT INTO platform_suppliers (
  name, legal_name, product_categories, manager_name, manager_phone,
  whatsapp, order_days, delivery_days, min_order_amount, payment_type,
  deferral_days, return_policy, return_comment, responsible_employee_id,
  responsible_employee_name, status, comment
)
SELECT
  'Кола',
  'ТОО Шымкент Кола',
  '{}',
  '',
  '',
  NULL,
  '',
  '',
  0,
  'cash',
  0,
  'no',
  NULL,
  NULL,
  NULL,
  'active',
  'Тип: ТОО
ИИН/БИН: 060240008111
Магазин: Shugyla
Адрес: ЮКО Казыгуртский район с казыгурт ул Б Момышулы 31'
WHERE NOT EXISTS (
  SELECT 1 FROM platform_suppliers WHERE lower(trim(name)) = lower(trim('Кола'))
);

INSERT INTO platform_suppliers (
  name, legal_name, product_categories, manager_name, manager_phone,
  whatsapp, order_days, delivery_days, min_order_amount, payment_type,
  deferral_days, return_policy, return_comment, responsible_employee_id,
  responsible_employee_name, status, comment
)
SELECT
  'Бек Тесто',
  NULL,
  '{}',
  '',
  '',
  NULL,
  '',
  '',
  0,
  'cash',
  0,
  'no',
  NULL,
  NULL,
  NULL,
  'active',
  'Магазин: Shugyla'
WHERE NOT EXISTS (
  SELECT 1 FROM platform_suppliers WHERE lower(trim(name)) = lower(trim('Бек Тесто'))
);

INSERT INTO platform_suppliers (
  name, legal_name, product_categories, manager_name, manager_phone,
  whatsapp, order_days, delivery_days, min_order_amount, payment_type,
  deferral_days, return_policy, return_comment, responsible_employee_id,
  responsible_employee_name, status, comment
)
SELECT
  'Мадина',
  NULL,
  '{}',
  '',
  '',
  NULL,
  '',
  '',
  0,
  'cash',
  0,
  'no',
  NULL,
  NULL,
  NULL,
  'active',
  'Магазин: Shugyla'
WHERE NOT EXISTS (
  SELECT 1 FROM platform_suppliers WHERE lower(trim(name)) = lower(trim('Мадина'))
);

INSERT INTO platform_suppliers (
  name, legal_name, product_categories, manager_name, manager_phone,
  whatsapp, order_days, delivery_days, min_order_amount, payment_type,
  deferral_days, return_policy, return_comment, responsible_employee_id,
  responsible_employee_name, status, comment
)
SELECT
  'Joby',
  NULL,
  '{}',
  '',
  '',
  NULL,
  '',
  '',
  0,
  'cash',
  0,
  'no',
  NULL,
  NULL,
  NULL,
  'active',
  'Тип: ИП
Магазин: Shugyla'
WHERE NOT EXISTS (
  SELECT 1 FROM platform_suppliers WHERE lower(trim(name)) = lower(trim('Joby'))
);

INSERT INTO platform_suppliers (
  name, legal_name, product_categories, manager_name, manager_phone,
  whatsapp, order_days, delivery_days, min_order_amount, payment_type,
  deferral_days, return_policy, return_comment, responsible_employee_id,
  responsible_employee_name, status, comment
)
SELECT
  'Куйрык Айбек',
  NULL,
  '{}',
  '',
  '',
  NULL,
  '',
  '',
  0,
  'cash',
  0,
  'no',
  NULL,
  NULL,
  NULL,
  'active',
  'Магазин: Shugyla'
WHERE NOT EXISTS (
  SELECT 1 FROM platform_suppliers WHERE lower(trim(name)) = lower(trim('Куйрык Айбек'))
);

INSERT INTO platform_suppliers (
  name, legal_name, product_categories, manager_name, manager_phone,
  whatsapp, order_days, delivery_days, min_order_amount, payment_type,
  deferral_days, return_policy, return_comment, responsible_employee_id,
  responsible_employee_name, status, comment
)
SELECT
  'Салат Мариям',
  NULL,
  '{}',
  '',
  '',
  NULL,
  '',
  '',
  0,
  'cash',
  0,
  'no',
  NULL,
  NULL,
  NULL,
  'active',
  'Магазин: Shugyla'
WHERE NOT EXISTS (
  SELECT 1 FROM platform_suppliers WHERE lower(trim(name)) = lower(trim('Салат Мариям'))
);

INSERT INTO platform_suppliers (
  name, legal_name, product_categories, manager_name, manager_phone,
  whatsapp, order_days, delivery_days, min_order_amount, payment_type,
  deferral_days, return_policy, return_comment, responsible_employee_id,
  responsible_employee_name, status, comment
)
SELECT
  'Орда трейд',
  NULL,
  '{}',
  '',
  '',
  NULL,
  '',
  '',
  0,
  'cash',
  0,
  'no',
  NULL,
  NULL,
  NULL,
  'active',
  'Магазин: Shugyla'
WHERE NOT EXISTS (
  SELECT 1 FROM platform_suppliers WHERE lower(trim(name)) = lower(trim('Орда трейд'))
);

INSERT INTO platform_suppliers (
  name, legal_name, product_categories, manager_name, manager_phone,
  whatsapp, order_days, delivery_days, min_order_amount, payment_type,
  deferral_days, return_policy, return_comment, responsible_employee_id,
  responsible_employee_name, status, comment
)
SELECT
  'Baby Food',
  'ТОО Baby Food KZ',
  '{}',
  '',
  '',
  NULL,
  '',
  '',
  0,
  'cash',
  0,
  'no',
  NULL,
  NULL,
  NULL,
  'active',
  'Тип: ТОО
ИИН/БИН: 120340011991
Магазин: Shugyla'
WHERE NOT EXISTS (
  SELECT 1 FROM platform_suppliers WHERE lower(trim(name)) = lower(trim('Baby Food'))
);

INSERT INTO platform_suppliers (
  name, legal_name, product_categories, manager_name, manager_phone,
  whatsapp, order_days, delivery_days, min_order_amount, payment_type,
  deferral_days, return_policy, return_comment, responsible_employee_id,
  responsible_employee_name, status, comment
)
SELECT
  'Сухофрукты',
  NULL,
  '{}',
  '',
  '',
  NULL,
  '',
  '',
  0,
  'cash',
  0,
  'no',
  NULL,
  NULL,
  NULL,
  'active',
  'Магазин: Shugyla'
WHERE NOT EXISTS (
  SELECT 1 FROM platform_suppliers WHERE lower(trim(name)) = lower(trim('Сухофрукты'))
);

INSERT INTO platform_suppliers (
  name, legal_name, product_categories, manager_name, manager_phone,
  whatsapp, order_days, delivery_days, min_order_amount, payment_type,
  deferral_days, return_policy, return_comment, responsible_employee_id,
  responsible_employee_name, status, comment
)
SELECT
  'Азия холод',
  NULL,
  '{}',
  '',
  '',
  NULL,
  '',
  '',
  0,
  'cash',
  0,
  'no',
  NULL,
  NULL,
  NULL,
  'active',
  'Магазин: Shugyla'
WHERE NOT EXISTS (
  SELECT 1 FROM platform_suppliers WHERE lower(trim(name)) = lower(trim('Азия холод'))
);

INSERT INTO platform_suppliers (
  name, legal_name, product_categories, manager_name, manager_phone,
  whatsapp, order_days, delivery_days, min_order_amount, payment_type,
  deferral_days, return_policy, return_comment, responsible_employee_id,
  responsible_employee_name, status, comment
)
SELECT
  'Грин Хаус',
  NULL,
  '{}',
  '',
  '',
  NULL,
  '',
  '',
  0,
  'cash',
  0,
  'no',
  NULL,
  NULL,
  NULL,
  'active',
  'Магазин: Shugyla'
WHERE NOT EXISTS (
  SELECT 1 FROM platform_suppliers WHERE lower(trim(name)) = lower(trim('Грин Хаус'))
);

INSERT INTO platform_suppliers (
  name, legal_name, product_categories, manager_name, manager_phone,
  whatsapp, order_days, delivery_days, min_order_amount, payment_type,
  deferral_days, return_policy, return_comment, responsible_employee_id,
  responsible_employee_name, status, comment
)
SELECT
  'Ермак',
  NULL,
  '{}',
  '',
  '',
  NULL,
  '',
  '',
  0,
  'cash',
  0,
  'no',
  NULL,
  NULL,
  NULL,
  'active',
  'Магазин: Shugyla'
WHERE NOT EXISTS (
  SELECT 1 FROM platform_suppliers WHERE lower(trim(name)) = lower(trim('Ермак'))
);

INSERT INTO platform_suppliers (
  name, legal_name, product_categories, manager_name, manager_phone,
  whatsapp, order_days, delivery_days, min_order_amount, payment_type,
  deferral_days, return_policy, return_comment, responsible_employee_id,
  responsible_employee_name, status, comment
)
SELECT
  'RLD',
  'ТОО Rich Life Distribution',
  '{}',
  '',
  '',
  NULL,
  '',
  '',
  0,
  'cash',
  0,
  'no',
  NULL,
  NULL,
  NULL,
  'active',
  'Тип: ТОО
ИИН/БИН: 100140009919
Магазин: Shugyla'
WHERE NOT EXISTS (
  SELECT 1 FROM platform_suppliers WHERE lower(trim(name)) = lower(trim('RLD'))
);

INSERT INTO platform_suppliers (
  name, legal_name, product_categories, manager_name, manager_phone,
  whatsapp, order_days, delivery_days, min_order_amount, payment_type,
  deferral_days, return_policy, return_comment, responsible_employee_id,
  responsible_employee_name, status, comment
)
SELECT
  'Три желания',
  'АО Евразиан Фудс Корпорэйшн',
  '{}',
  '',
  '',
  NULL,
  '',
  '',
  0,
  'cash',
  0,
  'no',
  NULL,
  NULL,
  NULL,
  'active',
  'Тип: AO
ИИН/БИН: 940540001140
Магазин: Shugyla
Адрес: АО г Алматы ул. Байзакова 69'
WHERE NOT EXISTS (
  SELECT 1 FROM platform_suppliers WHERE lower(trim(name)) = lower(trim('Три желания'))
);

INSERT INTO platform_suppliers (
  name, legal_name, product_categories, manager_name, manager_phone,
  whatsapp, order_days, delivery_days, min_order_amount, payment_type,
  deferral_days, return_policy, return_comment, responsible_employee_id,
  responsible_employee_name, status, comment
)
SELECT
  'TOO Kezi',
  'ТОО KEZI',
  '{}',
  '',
  '',
  NULL,
  '',
  '',
  0,
  'cash',
  0,
  'no',
  NULL,
  NULL,
  NULL,
  'active',
  'Тип: ИП
ИИН/БИН: 210440028433
Магазин: Shugyla'
WHERE NOT EXISTS (
  SELECT 1 FROM platform_suppliers WHERE lower(trim(name)) = lower(trim('TOO Kezi'))
);

INSERT INTO platform_suppliers (
  name, legal_name, product_categories, manager_name, manager_phone,
  whatsapp, order_days, delivery_days, min_order_amount, payment_type,
  deferral_days, return_policy, return_comment, responsible_employee_id,
  responsible_employee_name, status, comment
)
SELECT
  'Номер Оператор',
  NULL,
  '{}',
  '',
  '',
  NULL,
  '',
  '',
  0,
  'cash',
  0,
  'no',
  NULL,
  NULL,
  NULL,
  'active',
  'Магазин: Shugyla'
WHERE NOT EXISTS (
  SELECT 1 FROM platform_suppliers WHERE lower(trim(name)) = lower(trim('Номер Оператор'))
);

INSERT INTO platform_suppliers (
  name, legal_name, product_categories, manager_name, manager_phone,
  whatsapp, order_days, delivery_days, min_order_amount, payment_type,
  deferral_days, return_policy, return_comment, responsible_employee_id,
  responsible_employee_name, status, comment
)
SELECT
  'Южное солнце',
  'ИП САДЫКОВ',
  '{}',
  '',
  '',
  NULL,
  '',
  '',
  0,
  'cash',
  0,
  'no',
  NULL,
  NULL,
  NULL,
  'active',
  'Тип: ИП
ИИН/БИН: 860714300179
Магазин: Shugyla'
WHERE NOT EXISTS (
  SELECT 1 FROM platform_suppliers WHERE lower(trim(name)) = lower(trim('Южное солнце'))
);

INSERT INTO platform_suppliers (
  name, legal_name, product_categories, manager_name, manager_phone,
  whatsapp, order_days, delivery_days, min_order_amount, payment_type,
  deferral_days, return_policy, return_comment, responsible_employee_id,
  responsible_employee_name, status, comment
)
SELECT
  'Адилет кумыс',
  NULL,
  '{}',
  '',
  '',
  NULL,
  '',
  '',
  0,
  'cash',
  0,
  'no',
  NULL,
  NULL,
  NULL,
  'active',
  'Магазин: Shugyla'
WHERE NOT EXISTS (
  SELECT 1 FROM platform_suppliers WHERE lower(trim(name)) = lower(trim('Адилет кумыс'))
);

INSERT INTO platform_suppliers (
  name, legal_name, product_categories, manager_name, manager_phone,
  whatsapp, order_days, delivery_days, min_order_amount, payment_type,
  deferral_days, return_policy, return_comment, responsible_employee_id,
  responsible_employee_name, status, comment
)
SELECT
  'Tess',
  NULL,
  '{}',
  '',
  '',
  NULL,
  '',
  '',
  0,
  'cash',
  0,
  'no',
  NULL,
  NULL,
  NULL,
  'active',
  'Магазин: Shugyla'
WHERE NOT EXISTS (
  SELECT 1 FROM platform_suppliers WHERE lower(trim(name)) = lower(trim('Tess'))
);

INSERT INTO platform_suppliers (
  name, legal_name, product_categories, manager_name, manager_phone,
  whatsapp, order_days, delivery_days, min_order_amount, payment_type,
  deferral_days, return_policy, return_comment, responsible_employee_id,
  responsible_employee_name, status, comment
)
SELECT
  'Маслодел',
  'ТОО Масло Дел',
  '{}',
  '',
  '',
  NULL,
  '',
  '',
  0,
  'cash',
  0,
  'no',
  NULL,
  NULL,
  NULL,
  'active',
  'Тип: ТОО
ИИН/БИН: 990240000368
Магазин: Shugyla
Адрес: Республика Казахстан Алматы пр, Рыскулбекова 276'
WHERE NOT EXISTS (
  SELECT 1 FROM platform_suppliers WHERE lower(trim(name)) = lower(trim('Маслодел'))
);

INSERT INTO platform_suppliers (
  name, legal_name, product_categories, manager_name, manager_phone,
  whatsapp, order_days, delivery_days, min_order_amount, payment_type,
  deferral_days, return_policy, return_comment, responsible_employee_id,
  responsible_employee_name, status, comment
)
SELECT
  'ТОО Суперфуд',
  NULL,
  '{}',
  '',
  '',
  NULL,
  '',
  '',
  0,
  'cash',
  0,
  'no',
  NULL,
  NULL,
  NULL,
  'active',
  'Магазин: Shugyla'
WHERE NOT EXISTS (
  SELECT 1 FROM platform_suppliers WHERE lower(trim(name)) = lower(trim('ТОО Суперфуд'))
);

INSERT INTO platform_suppliers (
  name, legal_name, product_categories, manager_name, manager_phone,
  whatsapp, order_days, delivery_days, min_order_amount, payment_type,
  deferral_days, return_policy, return_comment, responsible_employee_id,
  responsible_employee_name, status, comment
)
SELECT
  'ТОО Азия Бизнес',
  NULL,
  '{}',
  '',
  '',
  NULL,
  '',
  '',
  0,
  'cash',
  0,
  'no',
  NULL,
  NULL,
  NULL,
  'active',
  'Магазин: Shugyla'
WHERE NOT EXISTS (
  SELECT 1 FROM platform_suppliers WHERE lower(trim(name)) = lower(trim('ТОО Азия Бизнес'))
);

INSERT INTO platform_suppliers (
  name, legal_name, product_categories, manager_name, manager_phone,
  whatsapp, order_days, delivery_days, min_order_amount, payment_type,
  deferral_days, return_policy, return_comment, responsible_employee_id,
  responsible_employee_name, status, comment
)
SELECT
  'Рокос Балык',
  NULL,
  '{}',
  '',
  '',
  NULL,
  '',
  '',
  0,
  'cash',
  0,
  'no',
  NULL,
  NULL,
  NULL,
  'active',
  'Магазин: Shugyla'
WHERE NOT EXISTS (
  SELECT 1 FROM platform_suppliers WHERE lower(trim(name)) = lower(trim('Рокос Балык'))
);

INSERT INTO platform_suppliers (
  name, legal_name, product_categories, manager_name, manager_phone,
  whatsapp, order_days, delivery_days, min_order_amount, payment_type,
  deferral_days, return_policy, return_comment, responsible_employee_id,
  responsible_employee_name, status, comment
)
SELECT
  'Мед',
  NULL,
  '{}',
  '',
  '',
  NULL,
  '',
  '',
  0,
  'cash',
  0,
  'no',
  NULL,
  NULL,
  NULL,
  'active',
  'Магазин: Shugyla'
WHERE NOT EXISTS (
  SELECT 1 FROM platform_suppliers WHERE lower(trim(name)) = lower(trim('Мед'))
);

INSERT INTO platform_suppliers (
  name, legal_name, product_categories, manager_name, manager_phone,
  whatsapp, order_days, delivery_days, min_order_amount, payment_type,
  deferral_days, return_policy, return_comment, responsible_employee_id,
  responsible_employee_name, status, comment
)
SELECT
  'Фиркан',
  NULL,
  '{}',
  '',
  '',
  NULL,
  '',
  '',
  0,
  'cash',
  0,
  'no',
  NULL,
  NULL,
  NULL,
  'active',
  'Магазин: Shugyla'
WHERE NOT EXISTS (
  SELECT 1 FROM platform_suppliers WHERE lower(trim(name)) = lower(trim('Фиркан'))
);

INSERT INTO platform_suppliers (
  name, legal_name, product_categories, manager_name, manager_phone,
  whatsapp, order_days, delivery_days, min_order_amount, payment_type,
  deferral_days, return_policy, return_comment, responsible_employee_id,
  responsible_employee_name, status, comment
)
SELECT
  'Корона',
  NULL,
  '{}',
  '',
  '',
  NULL,
  '',
  '',
  0,
  'cash',
  0,
  'no',
  NULL,
  NULL,
  NULL,
  'active',
  'Магазин: Shugyla'
WHERE NOT EXISTS (
  SELECT 1 FROM platform_suppliers WHERE lower(trim(name)) = lower(trim('Корона'))
);

INSERT INTO platform_suppliers (
  name, legal_name, product_categories, manager_name, manager_phone,
  whatsapp, order_days, delivery_days, min_order_amount, payment_type,
  deferral_days, return_policy, return_comment, responsible_employee_id,
  responsible_employee_name, status, comment
)
SELECT
  'Керемет трейд',
  NULL,
  '{}',
  '',
  '',
  NULL,
  '',
  '',
  0,
  'cash',
  0,
  'no',
  NULL,
  NULL,
  NULL,
  'active',
  'Магазин: Shugyla'
WHERE NOT EXISTS (
  SELECT 1 FROM platform_suppliers WHERE lower(trim(name)) = lower(trim('Керемет трейд'))
);

INSERT INTO platform_suppliers (
  name, legal_name, product_categories, manager_name, manager_phone,
  whatsapp, order_days, delivery_days, min_order_amount, payment_type,
  deferral_days, return_policy, return_comment, responsible_employee_id,
  responsible_employee_name, status, comment
)
SELECT
  'Буравлев',
  'ИП Буравлев Роман Валерьевич',
  '{}',
  '',
  '',
  NULL,
  '',
  '',
  0,
  'cash',
  0,
  'no',
  NULL,
  NULL,
  NULL,
  'active',
  'Тип: ИП
ИИН/БИН: 850605302292
Магазин: Shugyla'
WHERE NOT EXISTS (
  SELECT 1 FROM platform_suppliers WHERE lower(trim(name)) = lower(trim('Буравлев'))
);

INSERT INTO platform_suppliers (
  name, legal_name, product_categories, manager_name, manager_phone,
  whatsapp, order_days, delivery_days, min_order_amount, payment_type,
  deferral_days, return_policy, return_comment, responsible_employee_id,
  responsible_employee_name, status, comment
)
SELECT
  'Muratov',
  NULL,
  '{}',
  '',
  '',
  NULL,
  '',
  '',
  0,
  'cash',
  0,
  'no',
  NULL,
  NULL,
  NULL,
  'active',
  'Магазин: Shugyla'
WHERE NOT EXISTS (
  SELECT 1 FROM platform_suppliers WHERE lower(trim(name)) = lower(trim('Muratov'))
);

INSERT INTO platform_suppliers (
  name, legal_name, product_categories, manager_name, manager_phone,
  whatsapp, order_days, delivery_days, min_order_amount, payment_type,
  deferral_days, return_policy, return_comment, responsible_employee_id,
  responsible_employee_name, status, comment
)
SELECT
  'Албини',
  NULL,
  '{}',
  '',
  '',
  NULL,
  '',
  '',
  0,
  'cash',
  0,
  'no',
  NULL,
  NULL,
  NULL,
  'active',
  'Магазин: Shugyla'
WHERE NOT EXISTS (
  SELECT 1 FROM platform_suppliers WHERE lower(trim(name)) = lower(trim('Албини'))
);

INSERT INTO platform_suppliers (
  name, legal_name, product_categories, manager_name, manager_phone,
  whatsapp, order_days, delivery_days, min_order_amount, payment_type,
  deferral_days, return_policy, return_comment, responsible_employee_id,
  responsible_employee_name, status, comment
)
SELECT
  'ИП Асанбаев',
  NULL,
  '{}',
  '',
  '',
  NULL,
  '',
  '',
  0,
  'cash',
  0,
  'no',
  NULL,
  NULL,
  NULL,
  'active',
  'Магазин: Shugyla'
WHERE NOT EXISTS (
  SELECT 1 FROM platform_suppliers WHERE lower(trim(name)) = lower(trim('ИП Асанбаев'))
);

INSERT INTO platform_suppliers (
  name, legal_name, product_categories, manager_name, manager_phone,
  whatsapp, order_days, delivery_days, min_order_amount, payment_type,
  deferral_days, return_policy, return_comment, responsible_employee_id,
  responsible_employee_name, status, comment
)
SELECT
  'Сымбат',
  NULL,
  '{}',
  '',
  '',
  NULL,
  '',
  '',
  0,
  'cash',
  0,
  'no',
  NULL,
  NULL,
  NULL,
  'active',
  'Магазин: Shugyla'
WHERE NOT EXISTS (
  SELECT 1 FROM platform_suppliers WHERE lower(trim(name)) = lower(trim('Сымбат'))
);

INSERT INTO platform_suppliers (
  name, legal_name, product_categories, manager_name, manager_phone,
  whatsapp, order_days, delivery_days, min_order_amount, payment_type,
  deferral_days, return_policy, return_comment, responsible_employee_id,
  responsible_employee_name, status, comment
)
SELECT
  'ИП Нурбану',
  NULL,
  '{}',
  '',
  '',
  NULL,
  '',
  '',
  0,
  'cash',
  0,
  'no',
  NULL,
  NULL,
  NULL,
  'active',
  'Магазин: Shugyla'
WHERE NOT EXISTS (
  SELECT 1 FROM platform_suppliers WHERE lower(trim(name)) = lower(trim('ИП Нурбану'))
);

INSERT INTO platform_suppliers (
  name, legal_name, product_categories, manager_name, manager_phone,
  whatsapp, order_days, delivery_days, min_order_amount, payment_type,
  deferral_days, return_policy, return_comment, responsible_employee_id,
  responsible_employee_name, status, comment
)
SELECT
  'носки',
  NULL,
  '{}',
  '',
  '',
  NULL,
  '',
  '',
  0,
  'cash',
  0,
  'no',
  NULL,
  NULL,
  NULL,
  'active',
  'Магазин: Shugyla'
WHERE NOT EXISTS (
  SELECT 1 FROM platform_suppliers WHERE lower(trim(name)) = lower(trim('носки'))
);

INSERT INTO platform_suppliers (
  name, legal_name, product_categories, manager_name, manager_phone,
  whatsapp, order_days, delivery_days, min_order_amount, payment_type,
  deferral_days, return_policy, return_comment, responsible_employee_id,
  responsible_employee_name, status, comment
)
SELECT
  'Диззи',
  NULL,
  '{}',
  '',
  '',
  NULL,
  '',
  '',
  0,
  'cash',
  0,
  'no',
  NULL,
  NULL,
  NULL,
  'active',
  'Магазин: Shugyla'
WHERE NOT EXISTS (
  SELECT 1 FROM platform_suppliers WHERE lower(trim(name)) = lower(trim('Диззи'))
);

INSERT INTO platform_suppliers (
  name, legal_name, product_categories, manager_name, manager_phone,
  whatsapp, order_days, delivery_days, min_order_amount, payment_type,
  deferral_days, return_policy, return_comment, responsible_employee_id,
  responsible_employee_name, status, comment
)
SELECT
  'Нурасыл Продукты',
  NULL,
  '{}',
  '',
  '',
  NULL,
  '',
  '',
  0,
  'cash',
  0,
  'no',
  NULL,
  NULL,
  NULL,
  'active',
  'Магазин: Shugyla'
WHERE NOT EXISTS (
  SELECT 1 FROM platform_suppliers WHERE lower(trim(name)) = lower(trim('Нурасыл Продукты'))
);

INSERT INTO platform_suppliers (
  name, legal_name, product_categories, manager_name, manager_phone,
  whatsapp, order_days, delivery_days, min_order_amount, payment_type,
  deferral_days, return_policy, return_comment, responsible_employee_id,
  responsible_employee_name, status, comment
)
SELECT
  'Колбаса Елдос',
  NULL,
  '{}',
  '',
  '',
  NULL,
  '',
  '',
  0,
  'cash',
  0,
  'no',
  NULL,
  NULL,
  NULL,
  'active',
  'Магазин: Shugyla'
WHERE NOT EXISTS (
  SELECT 1 FROM platform_suppliers WHERE lower(trim(name)) = lower(trim('Колбаса Елдос'))
);

INSERT INTO platform_suppliers (
  name, legal_name, product_categories, manager_name, manager_phone,
  whatsapp, order_days, delivery_days, min_order_amount, payment_type,
  deferral_days, return_policy, return_comment, responsible_employee_id,
  responsible_employee_name, status, comment
)
SELECT
  'Игрушка',
  NULL,
  '{}',
  '',
  '',
  NULL,
  '',
  '',
  0,
  'cash',
  0,
  'no',
  NULL,
  NULL,
  NULL,
  'active',
  'Магазин: Shugyla'
WHERE NOT EXISTS (
  SELECT 1 FROM platform_suppliers WHERE lower(trim(name)) = lower(trim('Игрушка'))
);

INSERT INTO platform_suppliers (
  name, legal_name, product_categories, manager_name, manager_phone,
  whatsapp, order_days, delivery_days, min_order_amount, payment_type,
  deferral_days, return_policy, return_comment, responsible_employee_id,
  responsible_employee_name, status, comment
)
SELECT
  'Самгау',
  NULL,
  '{}',
  '',
  '',
  NULL,
  '',
  '',
  0,
  'cash',
  0,
  'no',
  NULL,
  NULL,
  NULL,
  'active',
  'Магазин: Shugyla'
WHERE NOT EXISTS (
  SELECT 1 FROM platform_suppliers WHERE lower(trim(name)) = lower(trim('Самгау'))
);

INSERT INTO platform_suppliers (
  name, legal_name, product_categories, manager_name, manager_phone,
  whatsapp, order_days, delivery_days, min_order_amount, payment_type,
  deferral_days, return_policy, return_comment, responsible_employee_id,
  responsible_employee_name, status, comment
)
SELECT
  'Бибо курт',
  NULL,
  '{}',
  '',
  '',
  NULL,
  '',
  '',
  0,
  'cash',
  0,
  'no',
  NULL,
  NULL,
  NULL,
  'active',
  'Магазин: Shugyla'
WHERE NOT EXISTS (
  SELECT 1 FROM platform_suppliers WHERE lower(trim(name)) = lower(trim('Бибо курт'))
);

INSERT INTO platform_suppliers (
  name, legal_name, product_categories, manager_name, manager_phone,
  whatsapp, order_days, delivery_days, min_order_amount, payment_type,
  deferral_days, return_policy, return_comment, responsible_employee_id,
  responsible_employee_name, status, comment
)
SELECT
  'Жасыл Үміт',
  NULL,
  '{}',
  '',
  '',
  NULL,
  '',
  '',
  0,
  'cash',
  0,
  'no',
  NULL,
  NULL,
  NULL,
  'active',
  'Тип: ТОО
Магазин: Shugyla'
WHERE NOT EXISTS (
  SELECT 1 FROM platform_suppliers WHERE lower(trim(name)) = lower(trim('Жасыл Үміт'))
);

INSERT INTO platform_suppliers (
  name, legal_name, product_categories, manager_name, manager_phone,
  whatsapp, order_days, delivery_days, min_order_amount, payment_type,
  deferral_days, return_policy, return_comment, responsible_employee_id,
  responsible_employee_name, status, comment
)
SELECT
  'ИП Мираж',
  'ИП Мираж',
  '{}',
  '',
  '',
  NULL,
  '',
  '',
  0,
  'cash',
  0,
  'no',
  NULL,
  NULL,
  NULL,
  'active',
  'Тип: ИП
ИИН/БИН: 010413500763
Магазин: Shugyla
Адрес: Г Туркестан улБашиков Д 2 A'
WHERE NOT EXISTS (
  SELECT 1 FROM platform_suppliers WHERE lower(trim(name)) = lower(trim('ИП Мираж'))
);

INSERT INTO platform_suppliers (
  name, legal_name, product_categories, manager_name, manager_phone,
  whatsapp, order_days, delivery_days, min_order_amount, payment_type,
  deferral_days, return_policy, return_comment, responsible_employee_id,
  responsible_employee_name, status, comment
)
SELECT
  'Данон',
  NULL,
  '{}',
  '',
  '',
  NULL,
  '',
  '',
  0,
  'cash',
  0,
  'no',
  NULL,
  NULL,
  NULL,
  'active',
  'Магазин: Shugyla'
WHERE NOT EXISTS (
  SELECT 1 FROM platform_suppliers WHERE lower(trim(name)) = lower(trim('Данон'))
);

INSERT INTO platform_suppliers (
  name, legal_name, product_categories, manager_name, manager_phone,
  whatsapp, order_days, delivery_days, min_order_amount, payment_type,
  deferral_days, return_policy, return_comment, responsible_employee_id,
  responsible_employee_name, status, comment
)
SELECT
  'Русский Бисквит',
  NULL,
  '{}',
  '',
  '',
  NULL,
  '',
  '',
  0,
  'cash',
  0,
  'no',
  NULL,
  NULL,
  NULL,
  'active',
  'Магазин: Shugyla'
WHERE NOT EXISTS (
  SELECT 1 FROM platform_suppliers WHERE lower(trim(name)) = lower(trim('Русский Бисквит'))
);

INSERT INTO platform_suppliers (
  name, legal_name, product_categories, manager_name, manager_phone,
  whatsapp, order_days, delivery_days, min_order_amount, payment_type,
  deferral_days, return_policy, return_comment, responsible_employee_id,
  responsible_employee_name, status, comment
)
SELECT
  'Чемпион чай',
  NULL,
  '{}',
  '',
  '',
  NULL,
  '',
  '',
  0,
  'cash',
  0,
  'no',
  NULL,
  NULL,
  NULL,
  'active',
  'Магазин: Shugyla'
WHERE NOT EXISTS (
  SELECT 1 FROM platform_suppliers WHERE lower(trim(name)) = lower(trim('Чемпион чай'))
);

INSERT INTO platform_suppliers (
  name, legal_name, product_categories, manager_name, manager_phone,
  whatsapp, order_days, delivery_days, min_order_amount, payment_type,
  deferral_days, return_policy, return_comment, responsible_employee_id,
  responsible_employee_name, status, comment
)
SELECT
  'Курт Дода',
  NULL,
  '{}',
  '',
  '',
  NULL,
  '',
  '',
  0,
  'cash',
  0,
  'no',
  NULL,
  NULL,
  NULL,
  'active',
  'Магазин: Shugyla'
WHERE NOT EXISTS (
  SELECT 1 FROM platform_suppliers WHERE lower(trim(name)) = lower(trim('Курт Дода'))
);

INSERT INTO platform_suppliers (
  name, legal_name, product_categories, manager_name, manager_phone,
  whatsapp, order_days, delivery_days, min_order_amount, payment_type,
  deferral_days, return_policy, return_comment, responsible_employee_id,
  responsible_employee_name, status, comment
)
SELECT
  'Боржоми',
  NULL,
  '{}',
  '',
  '',
  NULL,
  '',
  '',
  0,
  'cash',
  0,
  'no',
  NULL,
  NULL,
  NULL,
  'active',
  'Магазин: Shugyla'
WHERE NOT EXISTS (
  SELECT 1 FROM platform_suppliers WHERE lower(trim(name)) = lower(trim('Боржоми'))
);

INSERT INTO platform_suppliers (
  name, legal_name, product_categories, manager_name, manager_phone,
  whatsapp, order_days, delivery_days, min_order_amount, payment_type,
  deferral_days, return_policy, return_comment, responsible_employee_id,
  responsible_employee_name, status, comment
)
SELECT
  'Даулетгали кымыран',
  NULL,
  '{}',
  '',
  '+7 (701) 159-05-02',
  NULL,
  '',
  '',
  0,
  'cash',
  0,
  'no',
  NULL,
  NULL,
  NULL,
  'active',
  'Тип: ИП
Магазин: Shugyla'
WHERE NOT EXISTS (
  SELECT 1 FROM platform_suppliers WHERE lower(trim(name)) = lower(trim('Даулетгали кымыран'))
);

INSERT INTO platform_suppliers (
  name, legal_name, product_categories, manager_name, manager_phone,
  whatsapp, order_days, delivery_days, min_order_amount, payment_type,
  deferral_days, return_policy, return_comment, responsible_employee_id,
  responsible_employee_name, status, comment
)
SELECT
  'Молшылык магазин',
  NULL,
  '{}',
  '',
  '',
  NULL,
  '',
  '',
  0,
  'cash',
  0,
  'no',
  NULL,
  NULL,
  NULL,
  'active',
  'Магазин: Shugyla'
WHERE NOT EXISTS (
  SELECT 1 FROM platform_suppliers WHERE lower(trim(name)) = lower(trim('Молшылык магазин'))
);

INSERT INTO platform_suppliers (
  name, legal_name, product_categories, manager_name, manager_phone,
  whatsapp, order_days, delivery_days, min_order_amount, payment_type,
  deferral_days, return_policy, return_comment, responsible_employee_id,
  responsible_employee_name, status, comment
)
SELECT
  'Базар Канцелярские',
  NULL,
  '{}',
  '',
  '',
  NULL,
  '',
  '',
  0,
  'cash',
  0,
  'no',
  NULL,
  NULL,
  NULL,
  'active',
  'Магазин: Shugyla'
WHERE NOT EXISTS (
  SELECT 1 FROM platform_suppliers WHERE lower(trim(name)) = lower(trim('Базар Канцелярские'))
);

INSERT INTO platform_suppliers (
  name, legal_name, product_categories, manager_name, manager_phone,
  whatsapp, order_days, delivery_days, min_order_amount, payment_type,
  deferral_days, return_policy, return_comment, responsible_employee_id,
  responsible_employee_name, status, comment
)
SELECT
  'Омега',
  NULL,
  '{}',
  '',
  '',
  NULL,
  '',
  '',
  0,
  'cash',
  0,
  'no',
  NULL,
  NULL,
  NULL,
  'active',
  'Магазин: Shugyla'
WHERE NOT EXISTS (
  SELECT 1 FROM platform_suppliers WHERE lower(trim(name)) = lower(trim('Омега'))
);

INSERT INTO platform_suppliers (
  name, legal_name, product_categories, manager_name, manager_phone,
  whatsapp, order_days, delivery_days, min_order_amount, payment_type,
  deferral_days, return_policy, return_comment, responsible_employee_id,
  responsible_employee_name, status, comment
)
SELECT
  'Фарш',
  NULL,
  '{}',
  '',
  '',
  NULL,
  '',
  '',
  0,
  'cash',
  0,
  'no',
  NULL,
  NULL,
  NULL,
  'active',
  'Магазин: Shugyla'
WHERE NOT EXISTS (
  SELECT 1 FROM platform_suppliers WHERE lower(trim(name)) = lower(trim('Фарш'))
);

INSERT INTO platform_suppliers (
  name, legal_name, product_categories, manager_name, manager_phone,
  whatsapp, order_days, delivery_days, min_order_amount, payment_type,
  deferral_days, return_policy, return_comment, responsible_employee_id,
  responsible_employee_name, status, comment
)
SELECT
  'Достык',
  NULL,
  '{}',
  '',
  '',
  NULL,
  '',
  '',
  0,
  'cash',
  0,
  'no',
  NULL,
  NULL,
  NULL,
  'active',
  'Магазин: Shugyla'
WHERE NOT EXISTS (
  SELECT 1 FROM platform_suppliers WHERE lower(trim(name)) = lower(trim('Достык'))
);

INSERT INTO platform_suppliers (
  name, legal_name, product_categories, manager_name, manager_phone,
  whatsapp, order_days, delivery_days, min_order_amount, payment_type,
  deferral_days, return_policy, return_comment, responsible_employee_id,
  responsible_employee_name, status, comment
)
SELECT
  'Альфа Трейд',
  'ALFA TRADE Distribution',
  '{}',
  '',
  '',
  NULL,
  '',
  '',
  0,
  'cash',
  0,
  'no',
  NULL,
  NULL,
  NULL,
  'active',
  'Тип: ИП
ИИН/БИН: 900412400669
Магазин: Shugyla'
WHERE NOT EXISTS (
  SELECT 1 FROM platform_suppliers WHERE lower(trim(name)) = lower(trim('Альфа Трейд'))
);

INSERT INTO platform_suppliers (
  name, legal_name, product_categories, manager_name, manager_phone,
  whatsapp, order_days, delivery_days, min_order_amount, payment_type,
  deferral_days, return_policy, return_comment, responsible_employee_id,
  responsible_employee_name, status, comment
)
SELECT
  'Кублей',
  NULL,
  '{}',
  '',
  '',
  NULL,
  '',
  '',
  0,
  'cash',
  0,
  'no',
  NULL,
  NULL,
  NULL,
  'active',
  'Магазин: Shugyla'
WHERE NOT EXISTS (
  SELECT 1 FROM platform_suppliers WHERE lower(trim(name)) = lower(trim('Кублей'))
);

INSERT INTO platform_suppliers (
  name, legal_name, product_categories, manager_name, manager_phone,
  whatsapp, order_days, delivery_days, min_order_amount, payment_type,
  deferral_days, return_policy, return_comment, responsible_employee_id,
  responsible_employee_name, status, comment
)
SELECT
  'Tom food distribution',
  NULL,
  '{}',
  '',
  '',
  NULL,
  '',
  '',
  0,
  'cash',
  0,
  'no',
  NULL,
  NULL,
  NULL,
  'active',
  'Магазин: Shugyla'
WHERE NOT EXISTS (
  SELECT 1 FROM platform_suppliers WHERE lower(trim(name)) = lower(trim('Tom food distribution'))
);

INSERT INTO platform_suppliers (
  name, legal_name, product_categories, manager_name, manager_phone,
  whatsapp, order_days, delivery_days, min_order_amount, payment_type,
  deferral_days, return_policy, return_comment, responsible_employee_id,
  responsible_employee_name, status, comment
)
SELECT
  'Назгуль печенье',
  NULL,
  '{}',
  '',
  '',
  NULL,
  '',
  '',
  0,
  'cash',
  0,
  'no',
  NULL,
  NULL,
  NULL,
  'active',
  'Магазин: Shugyla'
WHERE NOT EXISTS (
  SELECT 1 FROM platform_suppliers WHERE lower(trim(name)) = lower(trim('Назгуль печенье'))
);

INSERT INTO platform_suppliers (
  name, legal_name, product_categories, manager_name, manager_phone,
  whatsapp, order_days, delivery_days, min_order_amount, payment_type,
  deferral_days, return_policy, return_comment, responsible_employee_id,
  responsible_employee_name, status, comment
)
SELECT
  'Байтерек',
  NULL,
  '{}',
  '',
  '',
  NULL,
  '',
  '',
  0,
  'cash',
  0,
  'no',
  NULL,
  NULL,
  NULL,
  'active',
  'Магазин: Shugyla'
WHERE NOT EXISTS (
  SELECT 1 FROM platform_suppliers WHERE lower(trim(name)) = lower(trim('Байтерек'))
);

INSERT INTO platform_suppliers (
  name, legal_name, product_categories, manager_name, manager_phone,
  whatsapp, order_days, delivery_days, min_order_amount, payment_type,
  deferral_days, return_policy, return_comment, responsible_employee_id,
  responsible_employee_name, status, comment
)
SELECT
  'Алматынан',
  NULL,
  '{}',
  '',
  '',
  NULL,
  '',
  '',
  0,
  'cash',
  0,
  'no',
  NULL,
  NULL,
  NULL,
  'active',
  'Магазин: Shugyla'
WHERE NOT EXISTS (
  SELECT 1 FROM platform_suppliers WHERE lower(trim(name)) = lower(trim('Алматынан'))
);

INSERT INTO platform_suppliers (
  name, legal_name, product_categories, manager_name, manager_phone,
  whatsapp, order_days, delivery_days, min_order_amount, payment_type,
  deferral_days, return_policy, return_comment, responsible_employee_id,
  responsible_employee_name, status, comment
)
SELECT
  'Сырлыбай Талкан',
  NULL,
  '{}',
  '',
  '',
  NULL,
  '',
  '',
  0,
  'cash',
  0,
  'no',
  NULL,
  NULL,
  NULL,
  'active',
  'Тип: ИП
Магазин: Shugyla'
WHERE NOT EXISTS (
  SELECT 1 FROM platform_suppliers WHERE lower(trim(name)) = lower(trim('Сырлыбай Талкан'))
);

INSERT INTO platform_suppliers (
  name, legal_name, product_categories, manager_name, manager_phone,
  whatsapp, order_days, delivery_days, min_order_amount, payment_type,
  deferral_days, return_policy, return_comment, responsible_employee_id,
  responsible_employee_name, status, comment
)
SELECT
  'Керуен',
  NULL,
  '{}',
  '',
  '',
  NULL,
  '',
  '',
  0,
  'cash',
  0,
  'no',
  NULL,
  NULL,
  NULL,
  'active',
  'Магазин: Shugyla'
WHERE NOT EXISTS (
  SELECT 1 FROM platform_suppliers WHERE lower(trim(name)) = lower(trim('Керуен'))
);

INSERT INTO platform_suppliers (
  name, legal_name, product_categories, manager_name, manager_phone,
  whatsapp, order_days, delivery_days, min_order_amount, payment_type,
  deferral_days, return_policy, return_comment, responsible_employee_id,
  responsible_employee_name, status, comment
)
SELECT
  'Ойыншык LGrand',
  NULL,
  '{}',
  '',
  '',
  NULL,
  '',
  '',
  0,
  'cash',
  0,
  'no',
  NULL,
  NULL,
  NULL,
  'active',
  'Магазин: Shugyla'
WHERE NOT EXISTS (
  SELECT 1 FROM platform_suppliers WHERE lower(trim(name)) = lower(trim('Ойыншык LGrand'))
);

INSERT INTO platform_suppliers (
  name, legal_name, product_categories, manager_name, manager_phone,
  whatsapp, order_days, delivery_days, min_order_amount, payment_type,
  deferral_days, return_policy, return_comment, responsible_employee_id,
  responsible_employee_name, status, comment
)
SELECT
  'Рауан',
  NULL,
  '{}',
  '',
  '',
  NULL,
  '',
  '',
  0,
  'cash',
  0,
  'no',
  NULL,
  NULL,
  NULL,
  'active',
  'Магазин: Shugyla'
WHERE NOT EXISTS (
  SELECT 1 FROM platform_suppliers WHERE lower(trim(name)) = lower(trim('Рауан'))
);

INSERT INTO platform_suppliers (
  name, legal_name, product_categories, manager_name, manager_phone,
  whatsapp, order_days, delivery_days, min_order_amount, payment_type,
  deferral_days, return_policy, return_comment, responsible_employee_id,
  responsible_employee_name, status, comment
)
SELECT
  'Банное товары',
  NULL,
  '{}',
  '',
  '',
  NULL,
  '',
  '',
  0,
  'cash',
  0,
  'no',
  NULL,
  NULL,
  NULL,
  'active',
  'Магазин: Shugyla'
WHERE NOT EXISTS (
  SELECT 1 FROM platform_suppliers WHERE lower(trim(name)) = lower(trim('Банное товары'))
);

INSERT INTO platform_suppliers (
  name, legal_name, product_categories, manager_name, manager_phone,
  whatsapp, order_days, delivery_days, min_order_amount, payment_type,
  deferral_days, return_policy, return_comment, responsible_employee_id,
  responsible_employee_name, status, comment
)
SELECT
  'Даму Ертос',
  NULL,
  '{}',
  '',
  '',
  NULL,
  '',
  '',
  0,
  'cash',
  0,
  'no',
  NULL,
  NULL,
  NULL,
  'active',
  'Магазин: Shugyla'
WHERE NOT EXISTS (
  SELECT 1 FROM platform_suppliers WHERE lower(trim(name)) = lower(trim('Даму Ертос'))
);

INSERT INTO platform_suppliers (
  name, legal_name, product_categories, manager_name, manager_phone,
  whatsapp, order_days, delivery_days, min_order_amount, payment_type,
  deferral_days, return_policy, return_comment, responsible_employee_id,
  responsible_employee_name, status, comment
)
SELECT
  'Орда трейд Чай',
  NULL,
  '{}',
  '',
  '',
  NULL,
  '',
  '',
  0,
  'cash',
  0,
  'no',
  NULL,
  NULL,
  NULL,
  'active',
  'Магазин: Shugyla'
WHERE NOT EXISTS (
  SELECT 1 FROM platform_suppliers WHERE lower(trim(name)) = lower(trim('Орда трейд Чай'))
);

INSERT INTO platform_suppliers (
  name, legal_name, product_categories, manager_name, manager_phone,
  whatsapp, order_days, delivery_days, min_order_amount, payment_type,
  deferral_days, return_policy, return_comment, responsible_employee_id,
  responsible_employee_name, status, comment
)
SELECT
  'Базар обувь',
  NULL,
  '{}',
  '',
  '',
  NULL,
  '',
  '',
  0,
  'cash',
  0,
  'no',
  NULL,
  NULL,
  NULL,
  'active',
  'Магазин: Shugyla'
WHERE NOT EXISTS (
  SELECT 1 FROM platform_suppliers WHERE lower(trim(name)) = lower(trim('Базар обувь'))
);

INSERT INTO platform_suppliers (
  name, legal_name, product_categories, manager_name, manager_phone,
  whatsapp, order_days, delivery_days, min_order_amount, payment_type,
  deferral_days, return_policy, return_comment, responsible_employee_id,
  responsible_employee_name, status, comment
)
SELECT
  'Ихсанов Феликс',
  'ИП Ихсанов Феликс',
  '{}',
  '',
  '',
  NULL,
  '',
  '',
  0,
  'cash',
  0,
  'no',
  NULL,
  NULL,
  NULL,
  'active',
  'Тип: ИП
ИИН/БИН: 050407550853
Магазин: Shugyla'
WHERE NOT EXISTS (
  SELECT 1 FROM platform_suppliers WHERE lower(trim(name)) = lower(trim('Ихсанов Феликс'))
);

INSERT INTO platform_suppliers (
  name, legal_name, product_categories, manager_name, manager_phone,
  whatsapp, order_days, delivery_days, min_order_amount, payment_type,
  deferral_days, return_policy, return_comment, responsible_employee_id,
  responsible_employee_name, status, comment
)
SELECT
  'Подарка НГ',
  NULL,
  '{}',
  '',
  '',
  NULL,
  '',
  '',
  0,
  'cash',
  0,
  'no',
  NULL,
  NULL,
  NULL,
  'active',
  'Магазин: Shugyla'
WHERE NOT EXISTS (
  SELECT 1 FROM platform_suppliers WHERE lower(trim(name)) = lower(trim('Подарка НГ'))
);

INSERT INTO platform_suppliers (
  name, legal_name, product_categories, manager_name, manager_phone,
  whatsapp, order_days, delivery_days, min_order_amount, payment_type,
  deferral_days, return_policy, return_comment, responsible_employee_id,
  responsible_employee_name, status, comment
)
SELECT
  'Холодец Круглая',
  NULL,
  '{}',
  '',
  '',
  NULL,
  '',
  '',
  0,
  'cash',
  0,
  'no',
  NULL,
  NULL,
  NULL,
  'active',
  'Магазин: Shugyla'
WHERE NOT EXISTS (
  SELECT 1 FROM platform_suppliers WHERE lower(trim(name)) = lower(trim('Холодец Круглая'))
);

INSERT INTO platform_suppliers (
  name, legal_name, product_categories, manager_name, manager_phone,
  whatsapp, order_days, delivery_days, min_order_amount, payment_type,
  deferral_days, return_policy, return_comment, responsible_employee_id,
  responsible_employee_name, status, comment
)
SELECT
  'Eloria Косметика',
  NULL,
  '{}',
  '',
  '',
  NULL,
  '',
  '',
  0,
  'cash',
  0,
  'no',
  NULL,
  NULL,
  NULL,
  'active',
  'Магазин: Shugyla'
WHERE NOT EXISTS (
  SELECT 1 FROM platform_suppliers WHERE lower(trim(name)) = lower(trim('Eloria Косметика'))
);

INSERT INTO platform_suppliers (
  name, legal_name, product_categories, manager_name, manager_phone,
  whatsapp, order_days, delivery_days, min_order_amount, payment_type,
  deferral_days, return_policy, return_comment, responsible_employee_id,
  responsible_employee_name, status, comment
)
SELECT
  'Улттык тагамдар',
  NULL,
  '{}',
  '',
  '',
  NULL,
  '',
  '',
  0,
  'cash',
  0,
  'no',
  NULL,
  NULL,
  NULL,
  'active',
  'Магазин: Shugyla'
WHERE NOT EXISTS (
  SELECT 1 FROM platform_suppliers WHERE lower(trim(name)) = lower(trim('Улттык тагамдар'))
);

INSERT INTO platform_suppliers (
  name, legal_name, product_categories, manager_name, manager_phone,
  whatsapp, order_days, delivery_days, min_order_amount, payment_type,
  deferral_days, return_policy, return_comment, responsible_employee_id,
  responsible_employee_name, status, comment
)
SELECT
  'ревизия',
  NULL,
  '{}',
  '',
  '',
  NULL,
  '',
  '',
  0,
  'cash',
  0,
  'no',
  NULL,
  NULL,
  NULL,
  'active',
  'Магазин: Shugyla'
WHERE NOT EXISTS (
  SELECT 1 FROM platform_suppliers WHERE lower(trim(name)) = lower(trim('ревизия'))
);

INSERT INTO platform_suppliers (
  name, legal_name, product_categories, manager_name, manager_phone,
  whatsapp, order_days, delivery_days, min_order_amount, payment_type,
  deferral_days, return_policy, return_comment, responsible_employee_id,
  responsible_employee_name, status, comment
)
SELECT
  'НурШар',
  NULL,
  '{}',
  '',
  '',
  NULL,
  '',
  '',
  0,
  'cash',
  0,
  'no',
  NULL,
  NULL,
  NULL,
  'active',
  'Магазин: Shugyla'
WHERE NOT EXISTS (
  SELECT 1 FROM platform_suppliers WHERE lower(trim(name)) = lower(trim('НурШар'))
);

INSERT INTO platform_suppliers (
  name, legal_name, product_categories, manager_name, manager_phone,
  whatsapp, order_days, delivery_days, min_order_amount, payment_type,
  deferral_days, return_policy, return_comment, responsible_employee_id,
  responsible_employee_name, status, comment
)
SELECT
  'Севара Салат',
  NULL,
  '{}',
  '',
  '',
  NULL,
  '',
  '',
  0,
  'cash',
  0,
  'no',
  NULL,
  NULL,
  NULL,
  'active',
  'Магазин: Shugyla'
WHERE NOT EXISTS (
  SELECT 1 FROM platform_suppliers WHERE lower(trim(name)) = lower(trim('Севара Салат'))
);

INSERT INTO platform_suppliers (
  name, legal_name, product_categories, manager_name, manager_phone,
  whatsapp, order_days, delivery_days, min_order_amount, payment_type,
  deferral_days, return_policy, return_comment, responsible_employee_id,
  responsible_employee_name, status, comment
)
SELECT
  'Хаггис',
  NULL,
  '{}',
  '',
  '',
  NULL,
  '',
  '',
  0,
  'cash',
  0,
  'no',
  NULL,
  NULL,
  NULL,
  'active',
  'Магазин: Shugyla'
WHERE NOT EXISTS (
  SELECT 1 FROM platform_suppliers WHERE lower(trim(name)) = lower(trim('Хаггис'))
);

INSERT INTO platform_suppliers (
  name, legal_name, product_categories, manager_name, manager_phone,
  whatsapp, order_days, delivery_days, min_order_amount, payment_type,
  deferral_days, return_policy, return_comment, responsible_employee_id,
  responsible_employee_name, status, comment
)
SELECT
  'TOO Consumer Trade Company',
  NULL,
  '{}',
  '',
  '',
  NULL,
  '',
  '',
  0,
  'cash',
  0,
  'no',
  NULL,
  NULL,
  NULL,
  'active',
  'Магазин: Shugyla'
WHERE NOT EXISTS (
  SELECT 1 FROM platform_suppliers WHERE lower(trim(name)) = lower(trim('TOO Consumer Trade Company'))
);

INSERT INTO platform_suppliers (
  name, legal_name, product_categories, manager_name, manager_phone,
  whatsapp, order_days, delivery_days, min_order_amount, payment_type,
  deferral_days, return_policy, return_comment, responsible_employee_id,
  responsible_employee_name, status, comment
)
SELECT
  'Дудар',
  NULL,
  '{}',
  '',
  '',
  NULL,
  '',
  '',
  0,
  'cash',
  0,
  'no',
  NULL,
  NULL,
  NULL,
  'active',
  'Магазин: Shugyla'
WHERE NOT EXISTS (
  SELECT 1 FROM platform_suppliers WHERE lower(trim(name)) = lower(trim('Дудар'))
);

INSERT INTO platform_suppliers (
  name, legal_name, product_categories, manager_name, manager_phone,
  whatsapp, order_days, delivery_days, min_order_amount, payment_type,
  deferral_days, return_policy, return_comment, responsible_employee_id,
  responsible_employee_name, status, comment
)
SELECT
  'Рокос',
  NULL,
  '{}',
  '',
  '',
  NULL,
  '',
  '',
  0,
  'cash',
  0,
  'no',
  NULL,
  NULL,
  NULL,
  'active',
  'Магазин: Shugyla'
WHERE NOT EXISTS (
  SELECT 1 FROM platform_suppliers WHERE lower(trim(name)) = lower(trim('Рокос'))
);

INSERT INTO platform_suppliers (
  name, legal_name, product_categories, manager_name, manager_phone,
  whatsapp, order_days, delivery_days, min_order_amount, payment_type,
  deferral_days, return_policy, return_comment, responsible_employee_id,
  responsible_employee_name, status, comment
)
SELECT
  'Базар Косметика',
  NULL,
  '{}',
  '',
  '',
  NULL,
  '',
  '',
  0,
  'cash',
  0,
  'no',
  NULL,
  NULL,
  NULL,
  'active',
  'Магазин: Shugyla'
WHERE NOT EXISTS (
  SELECT 1 FROM platform_suppliers WHERE lower(trim(name)) = lower(trim('Базар Косметика'))
);

INSERT INTO platform_suppliers (
  name, legal_name, product_categories, manager_name, manager_phone,
  whatsapp, order_days, delivery_days, min_order_amount, payment_type,
  deferral_days, return_policy, return_comment, responsible_employee_id,
  responsible_employee_name, status, comment
)
SELECT
  'Team Times',
  NULL,
  '{}',
  '',
  '',
  NULL,
  '',
  '',
  0,
  'cash',
  0,
  'no',
  NULL,
  NULL,
  NULL,
  'active',
  'Магазин: Shugyla'
WHERE NOT EXISTS (
  SELECT 1 FROM platform_suppliers WHERE lower(trim(name)) = lower(trim('Team Times'))
);

INSERT INTO platform_suppliers (
  name, legal_name, product_categories, manager_name, manager_phone,
  whatsapp, order_days, delivery_days, min_order_amount, payment_type,
  deferral_days, return_policy, return_comment, responsible_employee_id,
  responsible_employee_name, status, comment
)
SELECT
  'Пакет',
  NULL,
  '{}',
  '',
  '',
  NULL,
  '',
  '',
  0,
  'cash',
  0,
  'no',
  NULL,
  NULL,
  NULL,
  'active',
  'Магазин: Shugyla'
WHERE NOT EXISTS (
  SELECT 1 FROM platform_suppliers WHERE lower(trim(name)) = lower(trim('Пакет'))
);

INSERT INTO platform_suppliers (
  name, legal_name, product_categories, manager_name, manager_phone,
  whatsapp, order_days, delivery_days, min_order_amount, payment_type,
  deferral_days, return_policy, return_comment, responsible_employee_id,
  responsible_employee_name, status, comment
)
SELECT
  'Нурбекова',
  NULL,
  '{}',
  '',
  '',
  NULL,
  '',
  '',
  0,
  'cash',
  0,
  'no',
  NULL,
  NULL,
  NULL,
  'active',
  'Магазин: Shugyla'
WHERE NOT EXISTS (
  SELECT 1 FROM platform_suppliers WHERE lower(trim(name)) = lower(trim('Нурбекова'))
);

INSERT INTO platform_suppliers (
  name, legal_name, product_categories, manager_name, manager_phone,
  whatsapp, order_days, delivery_days, min_order_amount, payment_type,
  deferral_days, return_policy, return_comment, responsible_employee_id,
  responsible_employee_name, status, comment
)
SELECT
  'Aspan Asia',
  NULL,
  '{}',
  '',
  '',
  NULL,
  '',
  '',
  0,
  'cash',
  0,
  'no',
  NULL,
  NULL,
  NULL,
  'active',
  'Магазин: Shugyla'
WHERE NOT EXISTS (
  SELECT 1 FROM platform_suppliers WHERE lower(trim(name)) = lower(trim('Aspan Asia'))
);

INSERT INTO platform_suppliers (
  name, legal_name, product_categories, manager_name, manager_phone,
  whatsapp, order_days, delivery_days, min_order_amount, payment_type,
  deferral_days, return_policy, return_comment, responsible_employee_id,
  responsible_employee_name, status, comment
)
SELECT
  'Faberlic',
  NULL,
  '{}',
  '',
  '',
  NULL,
  '',
  '',
  0,
  'cash',
  0,
  'no',
  NULL,
  NULL,
  NULL,
  'active',
  'Магазин: Shugyla'
WHERE NOT EXISTS (
  SELECT 1 FROM platform_suppliers WHERE lower(trim(name)) = lower(trim('Faberlic'))
);

INSERT INTO platform_suppliers (
  name, legal_name, product_categories, manager_name, manager_phone,
  whatsapp, order_days, delivery_days, min_order_amount, payment_type,
  deferral_days, return_policy, return_comment, responsible_employee_id,
  responsible_employee_name, status, comment
)
SELECT
  'Базар Еркебулан',
  NULL,
  '{}',
  '',
  '',
  NULL,
  '',
  '',
  0,
  'cash',
  0,
  'no',
  NULL,
  NULL,
  NULL,
  'active',
  'Магазин: Shugyla'
WHERE NOT EXISTS (
  SELECT 1 FROM platform_suppliers WHERE lower(trim(name)) = lower(trim('Базар Еркебулан'))
);

INSERT INTO platform_suppliers (
  name, legal_name, product_categories, manager_name, manager_phone,
  whatsapp, order_days, delivery_days, min_order_amount, payment_type,
  deferral_days, return_policy, return_comment, responsible_employee_id,
  responsible_employee_name, status, comment
)
SELECT
  'Базар Чай',
  NULL,
  '{}',
  '',
  '',
  NULL,
  '',
  '',
  0,
  'cash',
  0,
  'no',
  NULL,
  NULL,
  NULL,
  'active',
  'Магазин: Shugyla'
WHERE NOT EXISTS (
  SELECT 1 FROM platform_suppliers WHERE lower(trim(name)) = lower(trim('Базар Чай'))
);

INSERT INTO platform_suppliers (
  name, legal_name, product_categories, manager_name, manager_phone,
  whatsapp, order_days, delivery_days, min_order_amount, payment_type,
  deferral_days, return_policy, return_comment, responsible_employee_id,
  responsible_employee_name, status, comment
)
SELECT
  'Базар Алма апай',
  NULL,
  '{}',
  '',
  '',
  NULL,
  '',
  '',
  0,
  'cash',
  0,
  'no',
  NULL,
  NULL,
  NULL,
  'active',
  'Магазин: Shugyla'
WHERE NOT EXISTS (
  SELECT 1 FROM platform_suppliers WHERE lower(trim(name)) = lower(trim('Базар Алма апай'))
);

INSERT INTO platform_suppliers (
  name, legal_name, product_categories, manager_name, manager_phone,
  whatsapp, order_days, delivery_days, min_order_amount, payment_type,
  deferral_days, return_policy, return_comment, responsible_employee_id,
  responsible_employee_name, status, comment
)
SELECT
  'Базар Приправа',
  NULL,
  '{}',
  '',
  '',
  NULL,
  '',
  '',
  0,
  'cash',
  0,
  'no',
  NULL,
  NULL,
  NULL,
  'active',
  'Магазин: Shugyla'
WHERE NOT EXISTS (
  SELECT 1 FROM platform_suppliers WHERE lower(trim(name)) = lower(trim('Базар Приправа'))
);

INSERT INTO platform_suppliers (
  name, legal_name, product_categories, manager_name, manager_phone,
  whatsapp, order_days, delivery_days, min_order_amount, payment_type,
  deferral_days, return_policy, return_comment, responsible_employee_id,
  responsible_employee_name, status, comment
)
SELECT
  'Самал',
  NULL,
  '{}',
  '',
  '',
  NULL,
  '',
  '',
  0,
  'cash',
  0,
  'no',
  NULL,
  NULL,
  NULL,
  'active',
  'Магазин: Shugyla'
WHERE NOT EXISTS (
  SELECT 1 FROM platform_suppliers WHERE lower(trim(name)) = lower(trim('Самал'))
);

INSERT INTO platform_suppliers (
  name, legal_name, product_categories, manager_name, manager_phone,
  whatsapp, order_days, delivery_days, min_order_amount, payment_type,
  deferral_days, return_policy, return_comment, responsible_employee_id,
  responsible_employee_name, status, comment
)
SELECT
  'Подарки',
  NULL,
  '{}',
  '',
  '',
  NULL,
  '',
  '',
  0,
  'cash',
  0,
  'no',
  NULL,
  NULL,
  NULL,
  'active',
  'Магазин: Shugyla'
WHERE NOT EXISTS (
  SELECT 1 FROM platform_suppliers WHERE lower(trim(name)) = lower(trim('Подарки'))
);

INSERT INTO platform_suppliers (
  name, legal_name, product_categories, manager_name, manager_phone,
  whatsapp, order_days, delivery_days, min_order_amount, payment_type,
  deferral_days, return_policy, return_comment, responsible_employee_id,
  responsible_employee_name, status, comment
)
SELECT
  'Бесик базар',
  NULL,
  '{}',
  '',
  '',
  NULL,
  '',
  '',
  0,
  'cash',
  0,
  'no',
  NULL,
  NULL,
  NULL,
  'active',
  'Магазин: Shugyla'
WHERE NOT EXISTS (
  SELECT 1 FROM platform_suppliers WHERE lower(trim(name)) = lower(trim('Бесик базар'))
);

INSERT INTO platform_suppliers (
  name, legal_name, product_categories, manager_name, manager_phone,
  whatsapp, order_days, delivery_days, min_order_amount, payment_type,
  deferral_days, return_policy, return_comment, responsible_employee_id,
  responsible_employee_name, status, comment
)
SELECT
  'Базар заколка',
  NULL,
  '{}',
  '',
  '',
  NULL,
  '',
  '',
  0,
  'cash',
  0,
  'no',
  NULL,
  NULL,
  NULL,
  'active',
  'Магазин: Shugyla'
WHERE NOT EXISTS (
  SELECT 1 FROM platform_suppliers WHERE lower(trim(name)) = lower(trim('Базар заколка'))
);

INSERT INTO platform_suppliers (
  name, legal_name, product_categories, manager_name, manager_phone,
  whatsapp, order_days, delivery_days, min_order_amount, payment_type,
  deferral_days, return_policy, return_comment, responsible_employee_id,
  responsible_employee_name, status, comment
)
SELECT
  'Коктем',
  NULL,
  '{}',
  '',
  '',
  NULL,
  '',
  '',
  0,
  'cash',
  0,
  'no',
  NULL,
  NULL,
  NULL,
  'active',
  'Магазин: Shugyla'
WHERE NOT EXISTS (
  SELECT 1 FROM platform_suppliers WHERE lower(trim(name)) = lower(trim('Коктем'))
);

INSERT INTO platform_suppliers (
  name, legal_name, product_categories, manager_name, manager_phone,
  whatsapp, order_days, delivery_days, min_order_amount, payment_type,
  deferral_days, return_policy, return_comment, responsible_employee_id,
  responsible_employee_name, status, comment
)
SELECT
  'Электроника',
  NULL,
  '{}',
  '',
  '',
  NULL,
  '',
  '',
  0,
  'cash',
  0,
  'no',
  NULL,
  NULL,
  NULL,
  'active',
  'Магазин: Shugyla'
WHERE NOT EXISTS (
  SELECT 1 FROM platform_suppliers WHERE lower(trim(name)) = lower(trim('Электроника'))
);
