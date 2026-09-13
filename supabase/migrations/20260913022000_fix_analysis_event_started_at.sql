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
    attempt_count = case
      when p_status = 'retrying' and attempt_count < 2 then attempt_count + 1
      when p_status = 'running' and attempt_count = 0 then 1
      else attempt_count
    end,
    started_at = case
      when p_status = 'running' and started_at is null then pg_catalog.now()
      else started_at
    end,
    finished_at = case when p_status in ('failed', 'needs_input', 'cancelled') then pg_catalog.now() else null end,
    final_event_id = case when p_status in ('failed', 'needs_input', 'cancelled') then p_event_id else null end,
    error_code = p_error_code,
    error_message = p_error_message,
    error_retryable = p_error_retryable
  where id = p_analysis_job_id returning * into target;
  return target;
end;
$$;

revoke all on function public.record_analysis_event(uuid, uuid, public.analysis_job_status, public.analysis_job_stage, text, text, boolean) from public, anon, authenticated;
grant execute on function public.record_analysis_event(uuid, uuid, public.analysis_job_status, public.analysis_job_stage, text, text, boolean) to service_role;
