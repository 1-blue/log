alter table public.analysis_jobs
  add column last_heartbeat_at timestamptz,
  add column retry_at timestamptz;

update public.analysis_jobs
set retry_at = pg_catalog.now()
where status = 'retrying';

alter table public.analysis_jobs
  add constraint analysis_jobs_retry_at_check check (
    (status = 'retrying' and retry_at is not null)
    or (status <> 'retrying' and retry_at is null)
  );

create table public.analysis_job_events (
  event_id uuid primary key,
  analysis_job_id uuid not null,
  owner_id uuid not null,
  run_attempt integer not null check (run_attempt between 1 and 2),
  event_type text not null check (
    event_type in (
      'queued', 'heartbeat', 'progress', 'retrying', 'succeeded',
      'failed', 'needs_input', 'cancelled'
    )
  ),
  status public.analysis_job_status not null,
  stage public.analysis_job_stage,
  step text check (step is null or step in ('job_facts', 'profile_comparison')),
  step_attempt integer check (step_attempt is null or step_attempt between 1 and 2),
  message text,
  error_code text,
  error_message text,
  error_retryable boolean not null default false,
  retry_at timestamptz,
  occurred_at timestamptz not null,
  received_at timestamptz not null default pg_catalog.now(),
  constraint analysis_job_events_job_fk
    foreign key (analysis_job_id, owner_id)
    references public.analysis_jobs (id, owner_id) on delete restrict,
  constraint analysis_job_events_lengths_check check (
    (message is null or pg_catalog.char_length(message) between 1 and 1000)
    and (error_code is null or pg_catalog.char_length(error_code) between 1 and 100)
    and (error_message is null or pg_catalog.char_length(error_message) between 1 and 500)
  ),
  constraint analysis_job_events_error_check check (
    (
      event_type in ('retrying', 'failed', 'needs_input', 'cancelled')
      and error_code is not null
      and error_message is not null
    )
    or (
      event_type not in ('retrying', 'failed', 'needs_input', 'cancelled')
      and error_code is null
      and error_message is null
      and error_retryable = false
    )
  ),
  constraint analysis_job_events_retry_check check (
    (event_type = 'retrying' and retry_at is not null)
    or (event_type <> 'retrying' and retry_at is null)
  )
);

create index analysis_job_events_job_received_idx
  on public.analysis_job_events (analysis_job_id, received_at desc, event_id desc);
create index analysis_jobs_stale_idx
  on public.analysis_jobs (last_heartbeat_at)
  where status in ('queued', 'running', 'retrying');

create trigger analysis_job_events_reject_mutation
  before update or delete on public.analysis_job_events
  for each row execute function private.reject_analysis_immutable_mutation();

alter table public.analysis_job_events enable row level security;
create policy "Owners can read their analysis job events"
  on public.analysis_job_events for select to authenticated
  using ((select auth.uid()) = owner_id);
revoke all on public.analysis_job_events from anon, authenticated;
grant select on public.analysis_job_events to authenticated;
grant all on public.analysis_job_events to service_role;

create or replace function private.analysis_stage_rank(
  value public.analysis_job_stage
)
returns integer language sql immutable set search_path = '' as $$
  select case value
    when 'dispatching' then 1
    when 'fetching' then 2
    when 'normalizing' then 3
    when 'extracting' then 4
    when 'matching' then 5
    when 'generating_questions' then 6
    when 'saving' then 7
    when 'notifying' then 8
    else 0
  end
$$;

create or replace function public.begin_analysis_attempt(
  p_analysis_job_id uuid,
  p_owner_id uuid,
  p_event_id uuid
)
returns public.analysis_jobs
language plpgsql security definer set search_path = '' as $$
declare target public.analysis_jobs; existing_job_id uuid;
begin
  select * into target
  from public.analysis_jobs
  where id = p_analysis_job_id and owner_id = p_owner_id
  for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'Analysis job not found';
  end if;

  select analysis_job_id into existing_job_id
  from public.analysis_job_events where event_id = p_event_id;
  if found then
    if existing_job_id = target.id then return target; end if;
    raise exception using errcode = '23505', message = 'Analysis event ID is already used';
  end if;

  if not (
    (target.status = 'queued' and target.attempt_count = 0)
    or (target.status = 'failed' and target.attempt_count < 2)
  ) then
    raise exception using errcode = '23514', message = 'Analysis job cannot start another attempt';
  end if;

  update public.analysis_jobs set
    attempt_count = attempt_count + 1,
    status = 'queued',
    stage = 'dispatching',
    error_code = null,
    error_message = null,
    error_retryable = false,
    final_event_id = null,
    finished_at = null,
    last_heartbeat_at = pg_catalog.now(),
    retry_at = null
  where id = target.id
  returning * into target;

  insert into public.analysis_job_events (
    event_id, analysis_job_id, owner_id, run_attempt, event_type,
    status, stage, message, occurred_at
  ) values (
    p_event_id, target.id, target.owner_id, target.attempt_count, 'queued',
    'queued', 'dispatching', '분석 Workflow 전달을 준비합니다.', pg_catalog.now()
  );
  return target;
end;
$$;

drop function public.record_analysis_event(
  uuid, uuid, public.analysis_job_status, public.analysis_job_stage,
  text, text, boolean
);

create or replace function public.record_analysis_event(
  p_analysis_job_id uuid,
  p_event_id uuid,
  p_run_attempt integer,
  p_event_type text,
  p_status public.analysis_job_status,
  p_stage public.analysis_job_stage default null,
  p_step text default null,
  p_step_attempt integer default null,
  p_retry_at timestamptz default null,
  p_error_code text default null,
  p_error_message text default null,
  p_error_retryable boolean default false,
  p_message text default null,
  p_occurred_at timestamptz default pg_catalog.now()
)
returns public.analysis_jobs
language plpgsql security definer set search_path = '' as $$
declare target public.analysis_jobs; existing_job_id uuid; transition_allowed boolean;
begin
  select * into target from public.analysis_jobs
  where id = p_analysis_job_id for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'Analysis job not found';
  end if;

  select analysis_job_id into existing_job_id
  from public.analysis_job_events where event_id = p_event_id;
  if found then
    if existing_job_id = target.id then return target; end if;
    raise exception using errcode = '23505', message = 'Analysis event ID is already used';
  end if;

  if p_run_attempt < target.attempt_count
    or target.status in ('succeeded', 'failed', 'needs_input', 'cancelled') then
    return target;
  end if;
  if p_run_attempt <> target.attempt_count then
    raise exception using errcode = '23514', message = 'Analysis run attempt does not match';
  end if;

  if not (
    (p_event_type in ('heartbeat', 'progress') and p_status = 'running')
    or (p_event_type = 'retrying' and p_status = 'retrying')
    or (p_event_type = 'failed' and p_status = 'failed')
    or (p_event_type = 'needs_input' and p_status = 'needs_input')
    or (p_event_type = 'cancelled' and p_status = 'cancelled')
  ) then
    raise exception using errcode = '23514', message = 'Analysis event and status do not match';
  end if;

  transition_allowed := case target.status
    when 'queued' then p_status in ('running', 'failed', 'cancelled')
    when 'running' then p_status in ('running', 'retrying', 'failed', 'needs_input', 'cancelled')
    when 'retrying' then p_status in ('running', 'failed', 'cancelled')
    else false
  end;
  if not transition_allowed then
    raise exception using errcode = '23514', message = 'Analysis state transition is not allowed';
  end if;

  if p_stage is not null and target.stage is not null
    and private.analysis_stage_rank(p_stage) < private.analysis_stage_rank(target.stage) then
    raise exception using errcode = '23514', message = 'Analysis stage cannot move backwards';
  end if;

  insert into public.analysis_job_events (
    event_id, analysis_job_id, owner_id, run_attempt, event_type, status,
    stage, step, step_attempt, message, error_code, error_message,
    error_retryable, retry_at, occurred_at
  ) values (
    p_event_id, target.id, target.owner_id, p_run_attempt, p_event_type, p_status,
    p_stage, p_step, p_step_attempt, p_message, p_error_code, p_error_message,
    p_error_retryable, p_retry_at, p_occurred_at
  );

  update public.analysis_jobs set
    status = p_status,
    stage = coalesce(p_stage, stage),
    started_at = case
      when p_status = 'running' and started_at is null then pg_catalog.now()
      else started_at
    end,
    finished_at = case
      when p_status in ('failed', 'needs_input', 'cancelled') then pg_catalog.now()
      else null
    end,
    final_event_id = case
      when p_status in ('failed', 'needs_input', 'cancelled') then p_event_id
      else null
    end,
    last_heartbeat_at = case
      when p_status in ('running', 'retrying') then pg_catalog.now()
      else last_heartbeat_at
    end,
    retry_at = case when p_status = 'retrying' then p_retry_at else null end,
    error_code = case
      when p_status in ('running') then null else p_error_code
    end,
    error_message = case
      when p_status in ('running') then null else p_error_message
    end,
    error_retryable = case
      when p_status in ('running') then false else p_error_retryable
    end
  where id = target.id returning * into target;
  return target;
end;
$$;

drop function public.complete_analysis_job(uuid, uuid, text, jsonb, jsonb, jsonb);

create or replace function public.complete_analysis_job(
  p_analysis_job_id uuid,
  p_event_id uuid,
  p_run_attempt integer,
  p_schema_version text,
  p_job_posting_facts jsonb,
  p_result jsonb,
  p_executions jsonb,
  p_occurred_at timestamptz default pg_catalog.now()
)
returns public.analysis_jobs
language plpgsql security definer set search_path = '' as $$
declare target public.analysis_jobs; execution jsonb; existing_job_id uuid;
begin
  select * into target from public.analysis_jobs
  where id = p_analysis_job_id for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'Analysis job not found';
  end if;

  select analysis_job_id into existing_job_id
  from public.analysis_job_events where event_id = p_event_id;
  if found then
    if existing_job_id = target.id then return target; end if;
    raise exception using errcode = '23505', message = 'Analysis event ID is already used';
  end if;
  if p_run_attempt < target.attempt_count
    or target.status in ('succeeded', 'failed', 'needs_input', 'cancelled') then
    return target;
  end if;
  if p_run_attempt <> target.attempt_count
    or target.status not in ('queued', 'running', 'retrying') then
    raise exception using errcode = '23514', message = 'Analysis result cannot complete this run';
  end if;

  insert into public.analysis_results (
    analysis_job_id, owner_id, schema_version, job_posting_facts,
    result, completed_event_id
  ) values (
    target.id, target.owner_id, p_schema_version, p_job_posting_facts,
    p_result, p_event_id
  );

  for execution in select value from pg_catalog.jsonb_array_elements(p_executions)
  loop
    insert into public.analysis_step_executions (
      analysis_job_id, owner_id, step, model, prompt_version, response_id,
      input_tokens, output_tokens, latency_ms, attempt_count
    ) values (
      target.id, target.owner_id, execution->>'step', execution->>'model',
      execution->>'promptVersion', execution->>'responseId',
      (execution->>'inputTokens')::integer, (execution->>'outputTokens')::integer,
      (execution->>'latencyMs')::integer, (execution->>'attemptCount')::integer
    );
  end loop;

  insert into public.analysis_job_events (
    event_id, analysis_job_id, owner_id, run_attempt, event_type,
    status, stage, message, occurred_at
  ) values (
    p_event_id, target.id, target.owner_id, p_run_attempt, 'succeeded',
    'succeeded', 'saving', '분석 결과 저장을 완료했습니다.', p_occurred_at
  );

  update public.analysis_jobs set
    status = 'succeeded',
    stage = 'saving',
    final_event_id = p_event_id,
    finished_at = pg_catalog.now(),
    last_heartbeat_at = pg_catalog.now(),
    retry_at = null,
    error_code = null,
    error_message = null,
    error_retryable = false
  where id = target.id returning * into target;
  return target;
end;
$$;

create or replace function public.cancel_analysis_job(
  p_analysis_job_id uuid,
  p_owner_id uuid,
  p_event_id uuid
)
returns public.analysis_jobs
language plpgsql security definer set search_path = '' as $$
declare target public.analysis_jobs; existing_job_id uuid;
begin
  select * into target from public.analysis_jobs
  where id = p_analysis_job_id and owner_id = p_owner_id for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'Analysis job not found';
  end if;

  select analysis_job_id into existing_job_id
  from public.analysis_job_events where event_id = p_event_id;
  if found then
    if existing_job_id = target.id then return target; end if;
    raise exception using errcode = '23505', message = 'Analysis event ID is already used';
  end if;
  if target.status = 'cancelled' then return target; end if;
  if target.status not in ('queued', 'running', 'retrying') then
    raise exception using errcode = '23514', message = 'Analysis job cannot be cancelled';
  end if;

  insert into public.analysis_job_events (
    event_id, analysis_job_id, owner_id, run_attempt, event_type, status,
    stage, message, error_code, error_message, error_retryable, occurred_at
  ) values (
    p_event_id, target.id, target.owner_id,
    greatest(target.attempt_count, 1), 'cancelled',
    'cancelled', target.stage, '관리자가 분석 작업을 취소했습니다.',
    'CANCELLED_BY_ADMIN', '관리자가 분석 작업을 취소했습니다.', false,
    pg_catalog.now()
  );

  update public.analysis_jobs set
    status = 'cancelled',
    finished_at = pg_catalog.now(),
    final_event_id = p_event_id,
    retry_at = null,
    error_code = 'CANCELLED_BY_ADMIN',
    error_message = '관리자가 분석 작업을 취소했습니다.',
    error_retryable = false
  where id = target.id returning * into target;
  return target;
end;
$$;

create or replace function public.fail_stale_analysis_jobs(
  p_cutoff timestamptz,
  p_limit integer default 100
)
returns setof uuid
language plpgsql security definer set search_path = '' as $$
declare target public.analysis_jobs; generated_event_id uuid;
begin
  for target in
    select * from public.analysis_jobs
    where status in ('queued', 'running', 'retrying')
      and coalesce(last_heartbeat_at, updated_at, created_at) < p_cutoff
    order by coalesce(last_heartbeat_at, updated_at, created_at), id
    for update skip locked
    limit least(greatest(p_limit, 1), 100)
  loop
    generated_event_id := extensions.gen_random_uuid();
    insert into public.analysis_job_events (
      event_id, analysis_job_id, owner_id, run_attempt, event_type, status,
      stage, message, error_code, error_message, error_retryable, occurred_at
    ) values (
      generated_event_id, target.id, target.owner_id,
      greatest(target.attempt_count, 1),
      'failed', 'failed', target.stage, '분석 Workflow 응답이 중단되었습니다.',
      'WORKFLOW_STALLED', '분석 Workflow 응답이 중단되었습니다.', true,
      pg_catalog.now()
    );
    update public.analysis_jobs set
      status = 'failed',
      finished_at = pg_catalog.now(),
      final_event_id = generated_event_id,
      retry_at = null,
      error_code = 'WORKFLOW_STALLED',
      error_message = '분석 Workflow 응답이 중단되었습니다.',
      error_retryable = true
    where id = target.id;
    return next target.id;
  end loop;
end;
$$;

revoke all on function private.analysis_stage_rank(public.analysis_job_stage) from public;
revoke all on function public.begin_analysis_attempt(uuid, uuid, uuid) from public, anon, authenticated;
revoke all on function public.record_analysis_event(
  uuid, uuid, integer, text, public.analysis_job_status,
  public.analysis_job_stage, text, integer, timestamptz,
  text, text, boolean, text, timestamptz
) from public, anon, authenticated;
revoke all on function public.complete_analysis_job(
  uuid, uuid, integer, text, jsonb, jsonb, jsonb, timestamptz
) from public, anon, authenticated;
revoke all on function public.cancel_analysis_job(uuid, uuid, uuid) from public, anon, authenticated;
revoke all on function public.fail_stale_analysis_jobs(timestamptz, integer) from public, anon, authenticated;

grant execute on function public.begin_analysis_attempt(uuid, uuid, uuid) to service_role;
grant execute on function public.record_analysis_event(
  uuid, uuid, integer, text, public.analysis_job_status,
  public.analysis_job_stage, text, integer, timestamptz,
  text, text, boolean, text, timestamptz
) to service_role;
grant execute on function public.complete_analysis_job(
  uuid, uuid, integer, text, jsonb, jsonb, jsonb, timestamptz
) to service_role;
grant execute on function public.cancel_analysis_job(uuid, uuid, uuid) to service_role;
grant execute on function public.fail_stale_analysis_jobs(timestamptz, integer) to service_role;
