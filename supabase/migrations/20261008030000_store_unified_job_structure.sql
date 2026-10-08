alter type public.job_posting_snapshot_source add value 'ai';
alter table public.job_posting_snapshots
  add column structured_facts jsonb,
  add column structure_version text,
  add column structure_model text,
  add column structure_prompt_version text;
alter table public.job_posting_snapshots add constraint job_posting_snapshot_structure_check check (
  (structured_facts is null and structure_version is null and structure_model is null and structure_prompt_version is null)
  or (jsonb_typeof(structured_facts) = 'object' and structure_version is not null and structure_model is not null and structure_prompt_version is not null)
);
alter table public.job_posting_collection_runs
  add column structure_event_id uuid,
  add column source_text_hash text check (source_text_hash is null or source_text_hash ~ '^[0-9a-f]{64}$');
create function public.claim_job_structuring(p_owner_id uuid,p_collection_run_id uuid,p_request_id uuid,p_event_id uuid,p_source_hash text)
returns boolean language plpgsql security definer set search_path = '' as $$
declare target public.job_posting_collection_runs;
begin
  perform pg_advisory_xact_lock(hashtextextended(p_owner_id::text,610063));
  select * into target from public.job_posting_collection_runs where owner_id=p_owner_id and id=p_collection_run_id for update;
  if not found then raise exception using errcode='P0002',message='Collection run not found'; end if;
  if target.request_id <> p_request_id or target.status not in ('queued','running') then
    raise exception using errcode='23514',message='Collection request is not active';
  end if;
  if p_event_id is null or p_source_hash is null or p_source_hash !~ '^[0-9a-f]{64}$' then
    raise exception using errcode='23514',message='Job structure requires an event and source hash';
  end if;
  if target.structure_event_id is not null then return false; end if;
  update public.job_posting_collection_runs set structure_event_id=p_event_id,source_text_hash=p_source_hash where id=target.id;
  return true;
end;
$$;
revoke all on function public.claim_job_structuring(uuid,uuid,uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.claim_job_structuring(uuid,uuid,uuid,uuid,text) to service_role;

create function public.complete_job_posting_collection_v3(
  p_collection_run_id uuid, p_owner_id uuid, p_event_id uuid,
  p_status public.job_posting_collection_status,
  p_error_code public.job_posting_collection_error_code default null,
  p_retryable boolean default false, p_http_status integer default null,
  p_snapshot_source public.job_posting_snapshot_source default null,
  p_raw_content text default null, p_normalized_content text default null,
  p_content_hash text default null, p_parser_version text default null,
  p_source_metadata jsonb default null, p_fetched_at timestamptz default null,
  p_sections jsonb default '{}'::jsonb, p_structured_facts jsonb default null,
  p_structure_version text default null, p_structure_model text default null,
  p_structure_prompt_version text default null
)
returns public.job_posting_collection_runs language plpgsql security definer set search_path = '' as $$
declare target_run public.job_posting_collection_runs; snapshot public.job_posting_snapshots;
begin
  perform pg_advisory_xact_lock(hashtextextended(p_owner_id::text,610063));
  select * into target_run from public.job_posting_collection_runs
    where id = p_collection_run_id and owner_id = p_owner_id for update;
  if not found then raise exception using errcode = 'P0002', message = 'Collection run not found'; end if;
  if target_run.final_event_id = p_event_id then return target_run; end if;
  if target_run.structure_event_id is not null and target_run.structure_event_id <> p_event_id then
    raise exception using errcode='23514',message='Job structure event does not match current request';
  end if;
  if p_status <> 'succeeded' then
    return public.complete_job_posting_collection_v2(p_collection_run_id,p_owner_id,p_event_id,p_status,
      p_error_code,p_retryable,p_http_status);
  end if;
  if target_run.status not in ('queued','running') or target_run.final_event_id is not null then
    raise exception using errcode = '23514', message = 'Collection run is already terminal';
  end if;
  if target_run.structure_event_id is distinct from p_event_id then
    raise exception using errcode='23514',message='Job structure event does not match current request';
  end if;
  if target_run.source_text_hash is distinct from encode(extensions.digest(p_raw_content,'sha256'),'hex') then
    raise exception using errcode='23514',message='Job structure source hash mismatch';
  end if;
  if p_snapshot_source is distinct from 'ai' or p_raw_content is null or p_normalized_content is null
    or p_content_hash is null or p_parser_version is null or p_source_metadata is null or p_fetched_at is null
    or p_error_code is not null or p_structured_facts is null or p_structure_version is null
    or p_structure_model is null or p_structure_prompt_version is null
    or jsonb_typeof(p_sections) <> 'object' or jsonb_typeof(p_structured_facts) <> 'object' then
    raise exception using errcode = '23514', message = 'Successful collection requires validated job structure';
  end if;
  insert into public.job_posting_snapshots(owner_id,job_posting_id,source,raw_content,normalized_content,
    content_hash,parser_version,source_metadata,sections,fetched_at,structured_facts,structure_version,structure_model,structure_prompt_version)
    values(p_owner_id,target_run.job_posting_id,p_snapshot_source,p_raw_content,p_normalized_content,
      p_content_hash,p_parser_version,p_source_metadata,p_sections,p_fetched_at,p_structured_facts,p_structure_version,p_structure_model,p_structure_prompt_version)
    on conflict(owner_id,job_posting_id,content_hash) do nothing returning * into snapshot;
  if snapshot.id is null then
    select * into snapshot from public.job_posting_snapshots where owner_id=p_owner_id
      and job_posting_id=target_run.job_posting_id and content_hash=p_content_hash;
    if snapshot.structure_version is distinct from p_structure_version
      or snapshot.structure_model is distinct from p_structure_model or snapshot.structure_prompt_version is distinct from p_structure_prompt_version then
      raise exception using errcode='23514',message='Job structure cache identity mismatch';
    end if;
  end if;
  update public.job_posting_collection_runs set status='succeeded',snapshot_id=snapshot.id,final_event_id=p_event_id,
    retryable=false,http_status=p_http_status,finished_at=now() where id=target_run.id returning * into target_run;
  return target_run;
end;
$$;
revoke all on function public.complete_job_posting_collection_v3(uuid,uuid,uuid,public.job_posting_collection_status,
  public.job_posting_collection_error_code,boolean,integer,public.job_posting_snapshot_source,text,text,text,text,jsonb,timestamptz,jsonb,jsonb,text,text,text)
  from public,anon,authenticated;
grant execute on function public.complete_job_posting_collection_v3(uuid,uuid,uuid,public.job_posting_collection_status,
  public.job_posting_collection_error_code,boolean,integer,public.job_posting_snapshot_source,text,text,text,text,jsonb,timestamptz,jsonb,jsonb,text,text,text)
  to service_role;
