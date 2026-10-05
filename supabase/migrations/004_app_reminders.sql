create table if not exists public.app_reminders (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  note text,
  remind_at timestamptz not null,
  status text not null default 'pending' check (status in ('pending','completed','cancelled')),
  snooze_count integer not null default 0,
  created_by uuid references auth.users(id) on delete set null,
  assigned_to uuid references auth.users(id) on delete set null,
  contact_source text check (contact_source in ('flowlu','sheet') or contact_source is null),
  contact_id text,
  flowlu_id bigint,
  contact_name text,
  contact_phone text,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists app_reminders_assigned_due_idx
  on public.app_reminders(assigned_to, status, remind_at);
create index if not exists app_reminders_created_due_idx
  on public.app_reminders(created_by, status, remind_at);
create index if not exists app_reminders_flowlu_idx
  on public.app_reminders(flowlu_id)
  where flowlu_id is not null;

alter table public.app_reminders enable row level security;

comment on table public.app_reminders is
  'Server-managed reminders for Whatsapp-api team users. Browser access is blocked by RLS; Vercel APIs use the service-role key after staff authentication.';
