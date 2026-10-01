create table if not exists public.flowlu_contacts_cache (
  flowlu_id bigint primary key,
  name text not null,
  first_name text,
  last_name text,
  phone text,
  email text,
  category_id bigint,
  category_name text,
  owner_id bigint,
  active boolean not null default true,
  description text,
  address text,
  raw jsonb not null default '{}'::jsonb,
  source_updated_at timestamptz,
  synced_at timestamptz not null default now()
);

create index if not exists flowlu_contacts_cache_phone_idx on public.flowlu_contacts_cache (phone);
create index if not exists flowlu_contacts_cache_category_idx on public.flowlu_contacts_cache (category_name);
create index if not exists flowlu_contacts_cache_owner_idx on public.flowlu_contacts_cache (owner_id);
create index if not exists flowlu_contacts_cache_active_idx on public.flowlu_contacts_cache (active);
alter table public.flowlu_contacts_cache enable row level security;

create table if not exists public.flowlu_sync_state (
  scope text primary key,
  last_full_sync_at timestamptz,
  last_webhook_at timestamptz,
  last_error text,
  records_count integer not null default 0,
  updated_at timestamptz not null default now()
);

alter table public.flowlu_sync_state enable row level security;
