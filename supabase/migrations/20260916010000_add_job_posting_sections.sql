alter table public.job_posting_snapshots
  add column if not exists sections jsonb not null default '{}'::jsonb;

alter table public.job_posting_snapshots
  add constraint job_posting_snapshots_sections_object
  check (pg_catalog.jsonb_typeof(sections) = 'object');

create or replace function public.complete_job_posting_collection_v2(
  p_collection_run_id uuid,
  p_owner_id uuid,
  p_event_id uuid,
  p_status public.job_posting_collection_status,
  p_error_code public.job_posting_collection_error_code default null,
  p_retryable boolean default false,
  p_http_status integer default null,
  p_snapshot_source public.job_posting_snapshot_source default null,
  p_raw_content text default null,
  p_normalized_content text default null,
  p_content_hash text default null,
  p_parser_version text default null,
  p_source_metadata jsonb default null,
  p_fetched_at timestamptz default null,
  p_sections jsonb default '{}'::jsonb
)
returns public.job_posting_collection_runs
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_run public.job_posting_collection_runs;
  target_snapshot public.job_posting_snapshots;
begin
  select * into target_run
    from public.job_posting_collection_runs
   where id = p_collection_run_id and owner_id = p_owner_id
   for update;

  if not found then
    raise exception using errcode = 'P0002', message = 'Collection run not found';
  end if;
  if target_run.final_event_id = p_event_id then return target_run; end if;
  if target_run.status not in ('queued', 'running') or target_run.final_event_id is not null then
    raise exception using errcode = '23514', message = 'Collection run is already terminal';
  end if;

  if p_status = 'succeeded' then
    if p_snapshot_source is null or p_raw_content is null
      or p_normalized_content is null or p_content_hash is null
      or p_parser_version is null or p_source_metadata is null
      or p_fetched_at is null or p_error_code is not null
      or pg_catalog.jsonb_typeof(coalesce(p_sections, '{}'::jsonb)) <> 'object' then
      raise exception using errcode = '23514', message = 'Successful collection requires a complete snapshot';
    end if;

    insert into public.job_posting_snapshots (
      owner_id, job_posting_id, source, raw_content, normalized_content,
      content_hash, parser_version, source_metadata, sections, fetched_at
    ) values (
      p_owner_id, target_run.job_posting_id, p_snapshot_source, p_raw_content,
      p_normalized_content, p_content_hash, p_parser_version,
      p_source_metadata, p_sections, p_fetched_at
    ) on conflict (owner_id, job_posting_id, content_hash) do nothing
    returning * into target_snapshot;

    if target_snapshot.id is null then
      select * into target_snapshot from public.job_posting_snapshots
       where owner_id = p_owner_id and job_posting_id = target_run.job_posting_id
         and content_hash = p_content_hash;
    end if;

    update public.job_posting_collection_runs
       set status = 'succeeded', snapshot_id = target_snapshot.id,
           final_event_id = p_event_id, retryable = false,
           http_status = p_http_status, finished_at = pg_catalog.now()
     where id = target_run.id returning * into target_run;
  elsif p_status in ('needs_input', 'failed') then
    if p_error_code is null then
      raise exception using errcode = '23514', message = 'Failed collection requires an error code';
    end if;
    update public.job_posting_collection_runs
       set status = p_status, error_code = p_error_code,
           final_event_id = p_event_id, retryable = p_retryable,
           http_status = p_http_status, finished_at = pg_catalog.now()
     where id = target_run.id returning * into target_run;
  else
    raise exception using errcode = '23514', message = 'Completion requires a terminal status';
  end if;
  return target_run;
end;
$$;

revoke all on function public.complete_job_posting_collection_v2(
  uuid, uuid, uuid, public.job_posting_collection_status,
  public.job_posting_collection_error_code, boolean, integer,
  public.job_posting_snapshot_source, text, text, text, text, jsonb,
  timestamptz, jsonb
) from public, anon, authenticated;
grant execute on function public.complete_job_posting_collection_v2(
  uuid, uuid, uuid, public.job_posting_collection_status,
  public.job_posting_collection_error_code, boolean, integer,
  public.job_posting_snapshot_source, text, text, text, text, jsonb,
  timestamptz, jsonb
) to service_role;
