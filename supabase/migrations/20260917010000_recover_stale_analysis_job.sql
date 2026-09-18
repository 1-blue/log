-- Allow an authenticated administrator to confirm and recover one stalled
-- analysis job without waiting for the scheduled stale-job sweep.
create or replace function public.recover_stale_analysis_job(
  p_analysis_job_id uuid,
  p_owner_id uuid,
  p_cutoff timestamptz
)
returns public.analysis_jobs
language plpgsql
security definer
set search_path = ''
as $$
declare
  target public.analysis_jobs;
  generated_event_id uuid;
begin
  select * into target
  from public.analysis_jobs
  where id = p_analysis_job_id
    and owner_id = p_owner_id
  for update;

  if not found then
    raise exception using errcode = 'P0002', message = 'Analysis job not found';
  end if;

  if target.status not in ('queued', 'running', 'retrying')
     or coalesce(target.last_heartbeat_at, target.updated_at, target.created_at) >= p_cutoff then
    return target;
  end if;

  generated_event_id := extensions.gen_random_uuid();

  insert into public.analysis_job_events (
    event_id,
    analysis_job_id,
    owner_id,
    run_attempt,
    event_type,
    status,
    stage,
    message,
    error_code,
    error_message,
    error_retryable,
    occurred_at
  ) values (
    generated_event_id,
    target.id,
    target.owner_id,
    greatest(target.attempt_count, 1),
    'failed',
    'failed',
    target.stage,
    '분석 Workflow 응답이 중단되었습니다.',
    'WORKFLOW_STALLED',
    '분석 Workflow 응답이 중단되었습니다.',
    true,
    pg_catalog.now()
  );

  update public.analysis_jobs
  set status = 'failed',
      finished_at = pg_catalog.now(),
      final_event_id = generated_event_id,
      retry_at = null,
      error_code = 'WORKFLOW_STALLED',
      error_message = '분석 Workflow 응답이 중단되었습니다.',
      error_retryable = true
  where id = target.id
  returning * into target;

  return target;
end;
$$;

revoke all on function public.recover_stale_analysis_job(uuid, uuid, timestamptz)
  from public, anon, authenticated;
grant execute on function public.recover_stale_analysis_job(uuid, uuid, timestamptz)
  to service_role;

comment on function public.recover_stale_analysis_job(uuid, uuid, timestamptz)
  is 'Marks one stale analysis job as a retryable failure; safe no-op for recent or terminal jobs.';
