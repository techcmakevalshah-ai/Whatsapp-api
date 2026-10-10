create table if not exists public.flowlu_task_timer_sessions (
  id uuid primary key default gen_random_uuid(),
  flowlu_task_id bigint not null,
  flowlu_task_name text not null default '',
  staff_key text not null,
  staff_name text not null default '',
  staff_email text not null default '',
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  duration_seconds integer not null default 0 check (duration_seconds >= 0),
  end_action text check (end_action is null or end_action in ('pause', 'stop', 'complete')),
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists flowlu_task_timer_task_started_idx
  on public.flowlu_task_timer_sessions (flowlu_task_id, started_at desc);

create index if not exists flowlu_task_timer_staff_started_idx
  on public.flowlu_task_timer_sessions (staff_key, started_at desc);

create unique index if not exists flowlu_task_timer_one_running_per_staff_idx
  on public.flowlu_task_timer_sessions (staff_key)
  where ended_at is null;

alter table public.flowlu_task_timer_sessions enable row level security;

comment on table public.flowlu_task_timer_sessions is
  'Server-managed timer sessions for Flowlu tasks. Browser clients do not receive direct table access.';
