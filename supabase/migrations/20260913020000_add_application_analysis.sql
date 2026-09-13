create type public.analysis_job_status as enum (
  'queued', 'running', 'needs_input', 'retrying', 'succeeded', 'failed', 'cancelled'
);

create type public.analysis_job_stage as enum (
  'dispatching', 'fetching', 'normalizing', 'extracting', 'matching',
  'generating_questions', 'saving', 'notifying'
);

create table public.analysis_jobs (
  id uuid primary key default extensions.gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete restrict,
  application_id uuid not null,
  job_posting_id uuid not null,
  job_posting_snapshot_id uuid not null,
  resume_version_id uuid not null,
  portfolio_version_id uuid not null,
  job_posting_text text not null,
  job_posting_content_hash text not null,
  resume_text text not null,
  resume_content_hash text not null,
  resume_original_length integer not null,
  resume_truncated boolean not null default false,
  portfolio_text text not null,
  portfolio_content_hash text not null,
  portfolio_original_length integer not null,
  portfolio_truncated boolean not null default false,
  status public.analysis_job_status not null default 'queued',
  stage public.analysis_job_stage,
  request_id uuid not null,
  attempt_count integer not null default 0,
  error_code text,
  error_message text,
  error_retryable boolean not null default false,
  final_event_id uuid unique,
  created_at timestamptz not null default pg_catalog.now(),
  started_at timestamptz,
  finished_at timestamptz,
  updated_at timestamptz not null default pg_catalog.now(),
  constraint analysis_jobs_application_fk
    foreign key (application_id, owner_id)
    references public.applications (id, owner_id) on delete restrict,
  constraint analysis_jobs_posting_fk
    foreign key (job_posting_id, owner_id)
    references public.job_postings (id, owner_id) on delete restrict,
  constraint analysis_jobs_snapshot_fk
    foreign key (job_posting_snapshot_id, owner_id)
    references public.job_posting_snapshots (id, owner_id) on delete restrict,
  constraint analysis_jobs_resume_fk
    foreign key (resume_version_id, owner_id, document_type)
    references public.document_versions (id, owner_id, document_type)
    on delete restrict,
  constraint analysis_jobs_portfolio_fk
    foreign key (portfolio_version_id, owner_id, portfolio_document_type)
    references public.document_versions (id, owner_id, document_type)
    on delete restrict,
  document_type public.document_type generated always as ('resume'::public.document_type) stored,
  portfolio_document_type public.document_type generated always as ('portfolio'::public.document_type) stored,
  constraint analysis_jobs_hashes_check check (
    job_posting_content_hash ~ '^[0-9a-f]{64}$'
    and resume_content_hash ~ '^[0-9a-f]{64}$'
    and portfolio_content_hash ~ '^[0-9a-f]{64}$'
  ),
  constraint analysis_jobs_text_length_check check (
    pg_catalog.char_length(job_posting_text) between 1 and 100000
    and pg_catalog.char_length(resume_text) between 1 and 80100
    and pg_catalog.char_length(portfolio_text) between 1 and 80100
  ),
  constraint analysis_jobs_original_length_check check (
    resume_original_length > 0 and portfolio_original_length > 0
  ),
  constraint analysis_jobs_attempt_count_check check (attempt_count between 0 and 2),
  constraint analysis_jobs_error_length_check check (
    (error_code is null or pg_catalog.char_length(error_code) between 1 and 100)
    and (error_message is null or pg_catalog.char_length(error_message) between 1 and 500)
  ),
  constraint analysis_jobs_terminal_check check (
    (status in ('queued', 'running', 'retrying') and finished_at is null and final_event_id is null)
    or (status in ('succeeded', 'failed', 'needs_input', 'cancelled') and finished_at is not null)
  ),
  constraint analysis_jobs_id_owner_key unique (id, owner_id)
);

create table public.analysis_results (
  analysis_job_id uuid primary key,
  owner_id uuid not null,
  schema_version text not null,
  job_posting_facts jsonb not null,
  result jsonb not null,
  completed_event_id uuid not null unique,
  created_at timestamptz not null default pg_catalog.now(),
  constraint analysis_results_job_fk
    foreign key (analysis_job_id, owner_id)
    references public.analysis_jobs (id, owner_id) on delete restrict,
  constraint analysis_results_schema_version_length
    check (pg_catalog.char_length(schema_version) between 1 and 30),
  constraint analysis_results_json_objects check (
    pg_catalog.jsonb_typeof(job_posting_facts) = 'object'
    and pg_catalog.jsonb_typeof(result) = 'object'
  )
);

create table public.analysis_step_executions (
  id uuid primary key default extensions.gen_random_uuid(),
  analysis_job_id uuid not null,
  owner_id uuid not null,
  step text not null check (step in ('job_facts', 'profile_comparison')),
  model text not null,
  prompt_version text not null,
  response_id text,
  input_tokens integer not null check (input_tokens >= 0),
  output_tokens integer not null check (output_tokens >= 0),
  latency_ms integer not null check (latency_ms >= 0),
  attempt_count integer not null check (attempt_count between 1 and 2),
  created_at timestamptz not null default pg_catalog.now(),
  constraint analysis_step_executions_job_fk
    foreign key (analysis_job_id, owner_id)
    references public.analysis_jobs (id, owner_id) on delete restrict,
  constraint analysis_step_executions_step_key unique (analysis_job_id, step),
  constraint analysis_step_executions_lengths check (
    pg_catalog.char_length(model) between 1 and 200
    and pg_catalog.char_length(prompt_version) between 1 and 100
    and (response_id is null or pg_catalog.char_length(response_id) between 1 and 300)
  )
);

create unique index analysis_jobs_one_active_per_application_idx
  on public.analysis_jobs (owner_id, application_id)
  where status in ('queued', 'running', 'retrying');
create index analysis_jobs_application_created_idx
  on public.analysis_jobs (owner_id, application_id, created_at desc, id desc);

create trigger analysis_jobs_set_updated_at
  before update on public.analysis_jobs
  for each row execute function private.set_updated_at();

create or replace function private.reject_analysis_immutable_mutation()
returns trigger language plpgsql set search_path = '' as $$
begin
  raise exception using errcode = '23514', message = 'Analysis records are immutable';
end;
$$;

create trigger analysis_results_reject_mutation
  before update or delete on public.analysis_results
  for each row execute function private.reject_analysis_immutable_mutation();
create trigger analysis_step_executions_reject_mutation
  before update or delete on public.analysis_step_executions
  for each row execute function private.reject_analysis_immutable_mutation();

alter table public.analysis_jobs enable row level security;
alter table public.analysis_results enable row level security;
alter table public.analysis_step_executions enable row level security;

create policy "Owners can read their analysis jobs" on public.analysis_jobs
  for select to authenticated using ((select auth.uid()) = owner_id);
create policy "Owners can read their analysis results" on public.analysis_results
  for select to authenticated using ((select auth.uid()) = owner_id);
create policy "Owners can read their analysis executions" on public.analysis_step_executions
  for select to authenticated using ((select auth.uid()) = owner_id);

create or replace function public.record_analysis_event(
  p_analysis_job_id uuid,
  p_event_id uuid,
  p_status public.analysis_job_status,
  p_stage public.analysis_job_stage default null,
  p_error_code text default null,
  p_error_message text default null,
  p_error_retryable boolean default false
)
returns public.analysis_jobs
language plpgsql security definer set search_path = '' as $$
declare target public.analysis_jobs;
begin
  select * into target from public.analysis_jobs where id = p_analysis_job_id for update;
  if not found then raise exception using errcode = 'P0002', message = 'Analysis job not found'; end if;
  if target.final_event_id = p_event_id then return target; end if;
  if target.status in ('succeeded', 'failed', 'needs_input', 'cancelled') then
    raise exception using errcode = '23514', message = 'Analysis job is already terminal';
  end if;

  update public.analysis_jobs set
    status = p_status,
    stage = p_stage,
    attempt_count = case when p_status in ('running', 'retrying') then
      pg_catalog.least(2, pg_catalog.greatest(attempt_count, 1)) else attempt_count end,
    started_at = case when p_status = 'running' then pg_catalog.coalesce(started_at, pg_catalog.now()) else started_at end,
    finished_at = case when p_status in ('failed', 'needs_input', 'cancelled') then pg_catalog.now() else null end,
    final_event_id = case when p_status in ('failed', 'needs_input', 'cancelled') then p_event_id else null end,
    error_code = p_error_code,
    error_message = p_error_message,
    error_retryable = p_error_retryable
  where id = p_analysis_job_id returning * into target;
  return target;
end;
$$;

create or replace function public.complete_analysis_job(
  p_analysis_job_id uuid,
  p_event_id uuid,
  p_schema_version text,
  p_job_posting_facts jsonb,
  p_result jsonb,
  p_executions jsonb
)
returns public.analysis_jobs
language plpgsql security definer set search_path = '' as $$
declare target public.analysis_jobs; execution jsonb;
begin
  select * into target from public.analysis_jobs where id = p_analysis_job_id for update;
  if not found then raise exception using errcode = 'P0002', message = 'Analysis job not found'; end if;
  if target.final_event_id = p_event_id then return target; end if;
  if target.status not in ('queued', 'running', 'retrying') or target.final_event_id is not null then
    raise exception using errcode = '23514', message = 'Analysis job is already terminal';
  end if;

  insert into public.analysis_results (
    analysis_job_id, owner_id, schema_version, job_posting_facts, result, completed_event_id
  ) values (
    target.id, target.owner_id, p_schema_version, p_job_posting_facts, p_result, p_event_id
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

  update public.analysis_jobs set status = 'succeeded', stage = 'saving',
    final_event_id = p_event_id, finished_at = pg_catalog.now(),
    error_code = null, error_message = null, error_retryable = false
  where id = target.id returning * into target;
  return target;
end;
$$;

revoke all on public.analysis_jobs, public.analysis_results, public.analysis_step_executions from anon, authenticated;
grant select on public.analysis_jobs, public.analysis_results, public.analysis_step_executions to authenticated;
grant all on public.analysis_jobs, public.analysis_results, public.analysis_step_executions to service_role;
revoke all on function public.record_analysis_event(uuid, uuid, public.analysis_job_status, public.analysis_job_stage, text, text, boolean) from public, anon, authenticated;
grant execute on function public.record_analysis_event(uuid, uuid, public.analysis_job_status, public.analysis_job_stage, text, text, boolean) to service_role;
revoke all on function public.complete_analysis_job(uuid, uuid, text, jsonb, jsonb, jsonb) from public, anon, authenticated;
grant execute on function public.complete_analysis_job(uuid, uuid, text, jsonb, jsonb, jsonb) to service_role;
revoke all on function private.reject_analysis_immutable_mutation() from public;
grant execute on function private.reject_analysis_immutable_mutation() to service_role;
