alter table public.message_series_steps
  add column if not exists send_time time without time zone null;

comment on column public.message_series_steps.send_time is
  'Optional local send time for this series day. NULL falls back to the schedule start/default local time.';

create or replace function public.resolve_message_series_run_at(
  p_reference timestamptz,
  p_timezone text,
  p_send_time time without time zone
)
returns timestamptz
language sql
stable
security definer
set search_path = public
as $function$
  select case
    when p_send_time is null then p_reference
    else (((p_reference at time zone p_timezone)::date + p_send_time) at time zone p_timezone)
  end;
$function$;

create or replace function public.advance_message_series_schedule(
  p_schedule_id uuid,
  p_expected_next_run timestamptz
)
returns public.message_series_schedules
language plpgsql
security definer
set search_path = public
as $function$
declare
  schedule_row public.message_series_schedules;
  updated_row public.message_series_schedules;
  next_step_time time without time zone;
  fallback_time time without time zone;
  next_local_date date;
  next_run timestamptz;
  new_runs integer;
begin
  select * into schedule_row
  from public.message_series_schedules
  where id = p_schedule_id
    and status = 'active'
    and next_run_at = p_expected_next_run
  for update;

  if not found then return null; end if;

  new_runs := schedule_row.runs_created + 1;

  if new_runs >= schedule_row.total_days then
    next_run := null;
  else
    select s.send_time into next_step_time
    from public.message_series_steps s
    where s.series_id = schedule_row.series_id
      and s.day_number = new_runs + 1
      and s.active = true
    limit 1;

    fallback_time := (schedule_row.start_at at time zone schedule_row.timezone)::time;
    next_local_date := (schedule_row.start_at at time zone schedule_row.timezone)::date + new_runs;
    next_run := ((next_local_date + coalesce(next_step_time, fallback_time)) at time zone schedule_row.timezone);
  end if;

  update public.message_series_schedules
  set runs_created = new_runs,
      last_run_at = p_expected_next_run,
      next_run_at = next_run,
      status = case when new_runs >= schedule_row.total_days then 'completed' else status end,
      locked_at = null,
      scheduler_error = null,
      updated_at = now()
  where id = p_schedule_id
    and status = 'active'
  returning * into updated_row;

  return updated_row;
end;
$function$;

create or replace function public.resume_message_series_schedule(
  p_schedule_id uuid
)
returns public.message_series_schedules
language plpgsql
security definer
set search_path = public
as $function$
declare
  schedule_row public.message_series_schedules;
  updated_row public.message_series_schedules;
  next_step_time time without time zone;
  fallback_time time without time zone;
  target_time time without time zone;
  today_local date;
  candidate timestamptz;
begin
  select * into schedule_row
  from public.message_series_schedules
  where id = p_schedule_id
    and status = 'paused'
    and runs_created < total_days
  for update;

  if not found then return null; end if;

  select s.send_time into next_step_time
  from public.message_series_steps s
  where s.series_id = schedule_row.series_id
    and s.day_number = schedule_row.runs_created + 1
    and s.active = true
  limit 1;

  fallback_time := (schedule_row.start_at at time zone schedule_row.timezone)::time;
  target_time := coalesce(next_step_time, fallback_time);
  today_local := (now() at time zone schedule_row.timezone)::date;
  candidate := ((today_local + target_time) at time zone schedule_row.timezone);

  if candidate <= now() + interval '1 minute' then
    candidate := (((today_local + 1) + target_time) at time zone schedule_row.timezone);
  end if;

  update public.message_series_schedules
  set status = 'active',
      next_run_at = candidate,
      locked_at = null,
      scheduler_error = null,
      updated_at = now()
  where id = p_schedule_id
    and status = 'paused'
    and runs_created < total_days
  returning * into updated_row;

  return updated_row;
end;
$function$;
