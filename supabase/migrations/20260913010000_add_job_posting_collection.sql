create type public.job_posting_collection_mode as enum ('automatic', 'manual');

create type public.job_posting_collection_status as enum (
  'queued',
  'running',
  'succeeded',
  'needs_input',
  'failed'
);

create type public.job_posting_collection_error_code as enum (
  'ACCESS_BLOCKED',
  'JOB_EXPIRED',
  'REDIRECT_NOT_ALLOWED',
  'INVALID_CONTENT_TYPE',
  'CONTENT_TOO_LARGE',
  'INVALID_JOB_POSTING',
  'PARSER_STRUCTURE_CHANGED',
  'URL_MISMATCH',
  'TIMEOUT',
  'NETWORK_ERROR',
  'RATE_LIMITED',
  'UPSTREAM_ERROR',
  'DISPATCH_FAILED'
);

create type public.job_posting_snapshot_source as enum (
  'wanted_json_ld',
  'manual'
);

create table public.job_posting_snapshots (
  id uuid primary key default extensions.gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete restrict,
  job_posting_id uuid not null,
  source public.job_posting_snapshot_source not null,
  raw_content text not null,
  normalized_content text not null,
  content_hash text not null,
  parser_version text not null,
  source_metadata jsonb not null,
  fetched_at timestamptz not null,
  created_at timestamptz not null default pg_catalog.now(),
  constraint job_posting_snapshots_posting_fk
    foreign key (job_posting_id, owner_id)
    references public.job_postings (id, owner_id)
    on delete restrict,
  constraint job_posting_snapshots_content_hash_check
    check (content_hash ~ '^[0-9a-f]{64}$'),
  constraint job_posting_snapshots_raw_content_length
    check (pg_catalog.char_length(raw_content) between 1 and 100000),
  constraint job_posting_snapshots_normalized_content_length
    check (pg_catalog.char_length(normalized_content) between 1 and 102000),
  constraint job_posting_snapshots_parser_version_length
    check (pg_catalog.char_length(parser_version) between 1 and 100),
  constraint job_posting_snapshots_source_metadata_object
    check (pg_catalog.jsonb_typeof(source_metadata) = 'object'),
  constraint job_posting_snapshots_owner_posting_hash_key
    unique (owner_id, job_posting_id, content_hash),
  constraint job_posting_snapshots_id_owner_key unique (id, owner_id)
);

create table public.job_posting_collection_runs (
  id uuid primary key default extensions.gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete restrict,
  job_posting_id uuid not null,
  mode public.job_posting_collection_mode not null,
  status public.job_posting_collection_status not null default 'queued',
  request_id uuid not null,
  error_code public.job_posting_collection_error_code,
  retryable boolean not null default false,
  http_status integer,
  snapshot_id uuid,
  final_event_id uuid unique,
  created_at timestamptz not null default pg_catalog.now(),
  started_at timestamptz,
  finished_at timestamptz,
  updated_at timestamptz not null default pg_catalog.now(),
  constraint job_posting_collection_runs_posting_fk
    foreign key (job_posting_id, owner_id)
    references public.job_postings (id, owner_id)
    on delete restrict,
  constraint job_posting_collection_runs_snapshot_fk
    foreign key (snapshot_id, owner_id)
    references public.job_posting_snapshots (id, owner_id)
    on delete restrict,
  constraint job_posting_collection_runs_http_status_check
    check (http_status is null or http_status between 100 and 599),
  constraint job_posting_collection_runs_terminal_check check (
    (status in ('queued', 'running') and finished_at is null and error_code is null and snapshot_id is null)
    or
    (status = 'succeeded' and finished_at is not null and error_code is null and snapshot_id is not null)
    or
    (status in ('needs_input', 'failed') and finished_at is not null and error_code is not null and snapshot_id is null)
  ),
  constraint job_posting_collection_runs_id_owner_key unique (id, owner_id)
);

create unique index job_posting_collection_runs_one_active_idx
  on public.job_posting_collection_runs (owner_id, job_posting_id)
  where status in ('queued', 'running');

create index job_posting_collection_runs_posting_created_idx
  on public.job_posting_collection_runs (owner_id, job_posting_id, created_at desc, id desc);

create index job_posting_snapshots_posting_fetched_idx
  on public.job_posting_snapshots (owner_id, job_posting_id, fetched_at desc, id desc);

create trigger job_posting_collection_runs_set_updated_at
  before update on public.job_posting_collection_runs
  for each row execute function private.set_updated_at();

create or replace function private.reject_job_posting_snapshot_mutation()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception using
    errcode = '23514',
    message = 'Job posting snapshots are immutable';
end;
$$;

create trigger job_posting_snapshots_reject_update
  before update or delete on public.job_posting_snapshots
  for each row execute function private.reject_job_posting_snapshot_mutation();

alter table public.job_posting_collection_runs enable row level security;
alter table public.job_posting_snapshots enable row level security;

create policy "Owners can read their job posting collection runs"
  on public.job_posting_collection_runs
  for select
  to authenticated
  using ((select auth.uid()) = owner_id);

create policy "Owners can read their job posting snapshots"
  on public.job_posting_snapshots
  for select
  to authenticated
  using ((select auth.uid()) = owner_id);

create or replace function public.complete_job_posting_collection(
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
  p_fetched_at timestamptz default null
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
   where id = p_collection_run_id
     and owner_id = p_owner_id
   for update;

  if not found then
    raise exception using errcode = 'P0002', message = 'Collection run not found';
  end if;

  if target_run.final_event_id = p_event_id then
    return target_run;
  end if;

  if target_run.status not in ('queued', 'running') or target_run.final_event_id is not null then
    raise exception using errcode = '23514', message = 'Collection run is already terminal';
  end if;

  if p_status = 'succeeded' then
    if p_snapshot_source is null or p_raw_content is null
      or p_normalized_content is null or p_content_hash is null
      or p_parser_version is null or p_source_metadata is null
      or p_fetched_at is null or p_error_code is not null then
      raise exception using errcode = '23514', message = 'Successful collection requires a complete snapshot';
    end if;

    insert into public.job_posting_snapshots (
      owner_id, job_posting_id, source, raw_content, normalized_content,
      content_hash, parser_version, source_metadata, fetched_at
    ) values (
      p_owner_id, target_run.job_posting_id, p_snapshot_source, p_raw_content,
      p_normalized_content, p_content_hash, p_parser_version,
      p_source_metadata, p_fetched_at
    )
    on conflict (owner_id, job_posting_id, content_hash)
    do nothing
    returning * into target_snapshot;

    if target_snapshot.id is null then
      select * into target_snapshot
        from public.job_posting_snapshots
       where owner_id = p_owner_id
         and job_posting_id = target_run.job_posting_id
         and content_hash = p_content_hash;
    end if;

    update public.job_posting_collection_runs
       set status = 'succeeded', snapshot_id = target_snapshot.id,
           final_event_id = p_event_id, retryable = false,
           http_status = p_http_status, finished_at = pg_catalog.now()
     where id = target_run.id
    returning * into target_run;
  elsif p_status in ('needs_input', 'failed') then
    if p_error_code is null then
      raise exception using errcode = '23514', message = 'Failed collection requires an error code';
    end if;

    update public.job_posting_collection_runs
       set status = p_status, error_code = p_error_code,
           final_event_id = p_event_id, retryable = p_retryable,
           http_status = p_http_status, finished_at = pg_catalog.now()
     where id = target_run.id
    returning * into target_run;
  else
    raise exception using errcode = '23514', message = 'Completion requires a terminal status';
  end if;

  return target_run;
end;
$$;

revoke all on table public.job_posting_collection_runs from anon, authenticated;
revoke all on table public.job_posting_snapshots from anon, authenticated;
grant select on table public.job_posting_collection_runs to authenticated;
grant select on table public.job_posting_snapshots to authenticated;
grant all on table public.job_posting_collection_runs to service_role;
grant all on table public.job_posting_snapshots to service_role;

revoke all on function private.reject_job_posting_snapshot_mutation() from public;
grant execute on function private.reject_job_posting_snapshot_mutation() to service_role;
revoke all on function public.complete_job_posting_collection(
  uuid, uuid, uuid, public.job_posting_collection_status,
  public.job_posting_collection_error_code, boolean, integer,
  public.job_posting_snapshot_source, text, text, text, text, jsonb, timestamptz
) from public, anon, authenticated;
grant execute on function public.complete_job_posting_collection(
  uuid, uuid, uuid, public.job_posting_collection_status,
  public.job_posting_collection_error_code, boolean, integer,
  public.job_posting_snapshot_source, text, text, text, text, jsonb, timestamptz
) to service_role;
