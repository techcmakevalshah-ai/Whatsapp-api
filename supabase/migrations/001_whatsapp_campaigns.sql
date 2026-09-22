create extension if not exists pgcrypto;

create table if not exists public.campaigns (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  template_name text not null,
  template_language text not null default 'en_US',
  header_type text,
  media_url text,
  status text not null default 'draft' check (status in ('draft','scheduled','sending','sent','sent_with_errors','failed')),
  scheduled_at timestamptz,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists public.campaign_recipients (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  name text not null,
  phone text not null,
  category text,
  variables jsonb not null default '{}'::jsonb,
  status text not null default 'Queued' check (status in ('Queued','Processing','Sent','Delivered','Read','Failed')),
  provider_message_id text,
  sent_at timestamptz,
  delivered_at timestamptz,
  read_at timestamptz,
  error_message text,
  created_at timestamptz not null default now()
);

create index if not exists campaigns_created_by_created_at_idx on public.campaigns(created_by, created_at desc);
create index if not exists campaigns_schedule_idx on public.campaigns(status, scheduled_at);
create index if not exists campaign_recipients_campaign_id_idx on public.campaign_recipients(campaign_id);
create index if not exists campaign_recipients_queue_idx on public.campaign_recipients(campaign_id, status, created_at);
create unique index if not exists campaign_recipients_provider_message_id_idx
  on public.campaign_recipients(provider_message_id)
  where provider_message_id is not null;

alter table public.campaigns enable row level security;
alter table public.campaign_recipients enable row level security;

-- The browser does not query these tables directly. Vercel functions use the
-- service-role key after verifying the signed-in Supabase user.
