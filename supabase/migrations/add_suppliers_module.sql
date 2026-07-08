-- Migration: Suppliers module (Shugyla Platform)

create table if not exists platform_suppliers (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  legal_name text,
  product_categories jsonb not null default '[]'::jsonb,
  manager_name text not null default '',
  manager_phone text not null default '',
  whatsapp text,
  order_days text not null default '',
  delivery_days text not null default '',
  min_order_amount numeric,
  payment_type text not null default 'cash',
  deferral_days integer,
  return_policy text not null default 'no',
  return_comment text,
  responsible_employee_id bigint references academy_users(id) on delete set null,
  responsible_employee_name text,
  status text not null default 'active',
  comment text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_platform_suppliers_status on platform_suppliers(status);
create index if not exists idx_platform_suppliers_name on platform_suppliers(name);

drop trigger if exists platform_suppliers_updated_at on platform_suppliers;
create trigger platform_suppliers_updated_at
  before update on platform_suppliers for each row execute function academy_set_updated_at();

alter table platform_suppliers enable row level security;

drop policy if exists "Allow anon read write platform_suppliers" on platform_suppliers;
create policy "Allow anon read write platform_suppliers"
  on platform_suppliers for all using (true) with check (true);
