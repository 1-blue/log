-- Service-only purge context cannot be forged by setting a session variable.
create table private.career_purge_context (
  transaction_id bigint primary key, owner_id uuid not null
);
revoke all on private.career_purge_context from public, anon, authenticated, service_role;
create function private.career_purge_allowed(p_owner uuid) returns boolean
language sql security definer set search_path = '' as $$
  select exists(select 1 from private.career_purge_context
    where transaction_id = txid_current() and owner_id = p_owner);
$$;

create table public.career_ops_maintenance (
  owner_id uuid primary key references auth.users(id) on delete restrict,
  enabled boolean not null default false, updated_at timestamptz not null default now()
);
create table public.career_deletion_operations (
  id uuid primary key default extensions.gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete restrict,
  target_type text not null check (target_type in ('application', 'document', 'reset')),
  target_id uuid, fingerprint text not null,
  status text not null check (status in ('pending', 'completed', 'failed')),
  error text, created_at timestamptz not null default now(), completed_at timestamptz,
  unique(owner_id, target_type, target_id, fingerprint)
);
create table public.career_storage_cleanup (
  id uuid primary key default extensions.gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete restrict,
  operation_id uuid not null references public.career_deletion_operations(id) on delete restrict,
  storage_path text not null, status text not null default 'pending'
    check(status in ('pending', 'processing', 'completed', 'failed')),
  attempts integer not null default 0, error text,
  updated_at timestamptz not null default now(),
  unique(operation_id, storage_path)
);
alter table public.career_ops_maintenance enable row level security;
alter table public.career_deletion_operations enable row level security;
alter table public.career_storage_cleanup enable row level security;
revoke all on public.career_ops_maintenance, public.career_deletion_operations,
  public.career_storage_cleanup from public, anon, authenticated;
grant all on public.career_ops_maintenance, public.career_deletion_operations,
  public.career_storage_cleanup to service_role;

create function private.guard_career_mutation() returns trigger
language plpgsql security definer set search_path = '' as $$
declare owner uuid := case when tg_op = 'DELETE' then old.owner_id else new.owner_id end;
begin
  perform pg_advisory_xact_lock(hashtextextended(owner::text, 610063));
  if exists(select 1 from public.career_ops_maintenance where owner_id = owner and enabled)
     and not private.career_purge_allowed(owner) then raise exception 'career_ops_maintenance'; end if;
  return case when tg_op = 'DELETE' then old else new end;
end;
$$;
do $$
declare table_name text;
begin
  foreach table_name in array array['applications','application_documents','application_status_history',
    'job_postings','job_posting_snapshots','job_posting_collection_runs','job_posting_analysis_profiles',
    'document_versions','document_publications','document_analysis_profiles','document_evidence_reviews',
    'analysis_jobs','analysis_results','analysis_step_executions','analysis_job_events',
    'analysis_reviews','analysis_requirement_reviews','interview_questions','interview_answers',
    'interview_notes','interview_checklist_items','slack_notifications','slack_job_threads','api_idempotency_records'] loop
    execute format('create trigger career_mutation_guard before insert or update or delete on public.%I for each row execute function private.guard_career_mutation()', table_name);
  end loop;
end;
$$;

-- Even previously-issued upload tokens cannot finalize a new object during reset.
create function private.guard_career_storage_upload() returns trigger
language plpgsql security definer set search_path = '' as $$
declare owner uuid;
begin
  if new.bucket_id <> 'career-documents' then return new; end if;
  if split_part(new.name, '/', 1) !~ '^[0-9a-fA-F-]{36}$' then return new; end if;
  owner := split_part(new.name, '/', 1)::uuid;
  perform pg_advisory_xact_lock(hashtextextended(owner::text, 610063));
  if exists(select 1 from public.career_ops_maintenance where owner_id = owner and enabled) then
    raise exception 'career_ops_maintenance';
  end if;
  return new;
end;
$$;
create trigger career_storage_upload_guard before insert or update on storage.objects
  for each row execute function private.guard_career_storage_upload();

create or replace function private.reject_analysis_immutable_mutation() returns trigger
language plpgsql set search_path = '' as $$
begin
  if tg_op = 'DELETE' and private.career_purge_allowed(old.owner_id) then return old; end if;
  raise exception using errcode = '23514', message = 'Analysis records are immutable';
end;
$$;
create or replace function private.reject_job_posting_snapshot_mutation() returns trigger
language plpgsql set search_path = '' as $$
begin
  if tg_op = 'DELETE' and private.career_purge_allowed(old.owner_id) then return old; end if;
  raise exception using errcode = '23514', message = 'Job posting snapshots are immutable';
end;
$$;
create or replace function private.validate_application_document_change() returns trigger
language plpgsql set search_path = '' as $$
declare
  application_id uuid := case when tg_op = 'DELETE' then old.application_id else new.application_id end;
  owner uuid := case when tg_op = 'DELETE' then old.owner_id else new.owner_id end;
  locked_at timestamptz; version_archived_at timestamptz;
begin
  if tg_op = 'DELETE' and private.career_purge_allowed(owner) then return old; end if;
  select a.documents_locked_at into locked_at from public.applications a where a.id = application_id and a.owner_id = owner;
  if locked_at is not null then
    raise exception using errcode = '23514', message = 'Submitted application documents cannot be changed';
  end if;
  if tg_op <> 'DELETE' then
    select d.archived_at into version_archived_at from public.document_versions d
      where d.id = new.document_version_id and d.owner_id = new.owner_id and d.document_type = new.document_type;
    if not found then raise exception using errcode = '23503', message = 'The selected document does not match its owner and type'; end if;
    if version_archived_at is not null then raise exception using errcode = '23514', message = 'An archived document cannot be selected'; end if;
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

-- The private graph contains original rows for fingerprinting and deletion, never API output.
create function private.career_deletion_graph(p_owner uuid, p_type text, p_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  app_ids uuid[] := '{}'; job_ids uuid[] := '{}'; doc_ids uuid[] := '{}';
  question_ids uuid[] := '{}'; notification_ids uuid[] := '{}';
  rows jsonb := '{}'; table_rows jsonb; counts jsonb := '{}'; blockers jsonb := '[]';
  spec text[]; condition text; target jsonb; labels jsonb;
begin
  if p_type not in ('application','document','reset') then raise exception 'invalid_target'; end if;
  if p_type = 'application' then
    select to_jsonb(a) into target from public.applications a where owner_id = p_owner and id = p_id;
    if target is null then raise exception 'resource_not_found'; end if;
    app_ids := array[p_id];
    if target->>'archived_at' is null then blockers := blockers || jsonb_build_array(jsonb_build_object('id',p_id,'label','지원 이력','reason','not_archived')); end if;
  elsif p_type = 'document' then
    select to_jsonb(d) into target from public.document_versions d where owner_id = p_owner and id = p_id;
    if target is null then raise exception 'resource_not_found'; end if;
    doc_ids := array[p_id];
    if target->>'archived_at' is null then blockers := blockers || jsonb_build_array(jsonb_build_object('id',p_id,'label',target->>'label','reason','not_archived')); end if;
    select coalesce(array_agg(distinct a.id), '{}') into app_ids from public.applications a
     where a.owner_id = p_owner and (exists(select 1 from public.application_documents d where d.owner_id = p_owner and d.application_id = a.id and d.document_version_id = p_id)
      or exists(select 1 from public.analysis_jobs j where j.owner_id = p_owner and j.application_id = a.id
       and (j.resume_version_id = p_id or j.portfolio_version_id = p_id
         or j.resume_profile_id in (select id from public.document_analysis_profiles where owner_id = p_owner and document_version_id = p_id)
         or j.portfolio_profile_id in (select id from public.document_analysis_profiles where owner_id = p_owner and document_version_id = p_id))));
    select blockers || coalesce(jsonb_agg(jsonb_build_object('id',a.id,'label',p.company_name || ' · ' || p.title,'reason','active_application') order by a.id), '[]')
     into blockers from public.applications a join public.job_postings p on p.id = a.job_posting_id
     where a.owner_id = p_owner and a.id = any(app_ids) and a.archived_at is null;
  else
    select coalesce(array_agg(id), '{}') into app_ids from public.applications where owner_id = p_owner;
    select coalesce(array_agg(id), '{}') into doc_ids from public.document_versions where owner_id = p_owner;
  end if;
  select coalesce(array_agg(id), '{}') into job_ids from public.analysis_jobs where owner_id = p_owner and application_id = any(app_ids);
  select coalesce(array_agg(id), '{}') into question_ids from public.interview_questions where owner_id = p_owner and analysis_job_id = any(job_ids);
  select coalesce(array_agg(id), '{}') into notification_ids from public.slack_notifications
    where owner_id = p_owner and (p_type = 'reset' or application_id = any(app_ids) or analysis_job_id = any(job_ids));
  -- FK-safe child-first order, also shared by the reset path.
  foreach spec slice 1 in array array[
    ['slack_job_threads','root_notification_id'], ['slack_notifications','notification_id'],
    ['interview_notes','application_id'], ['interview_answers','question_id'],
    ['interview_checklist_items','analysis_job_id'], ['analysis_requirement_reviews','analysis_job_id'],
    ['analysis_reviews','analysis_job_id'], ['interview_questions','analysis_job_id'],
    ['analysis_results','analysis_job_id'], ['analysis_step_executions','analysis_job_id'],
    ['analysis_job_events','analysis_job_id'], ['analysis_jobs','job_id'],
    ['application_status_history','application_id'], ['application_documents','application_id'],
    ['api_idempotency_records','idempotency'], ['applications','application'],
    ['document_evidence_reviews','document_version_id'], ['document_analysis_profiles','document_version_id'],
    ['document_publications','document_version_id'], ['document_versions','document'],
    ['job_posting_analysis_profiles','reset'], ['job_posting_collection_runs','reset'],
    ['job_posting_snapshots','reset'], ['job_postings','reset']
  ] loop
    condition := case spec[2]
      when 'application' then 't.id = any($2)'
      when 'application_id' then 't.application_id = any($2)'
      when 'job_id' then 't.id = any($3)'
      when 'analysis_job_id' then 't.analysis_job_id = any($3)'
      when 'question_id' then 't.question_id = any($5)'
      when 'notification_id' then 't.id = any($6)'
      when 'root_notification_id' then 't.root_notification_id = any($6)'
      when 'document' then 't.id = any($4)'
      when 'document_version_id' then 't.document_version_id = any($4)'
      when 'idempotency' then 't.request_method <> ''DELETE'' and exists(select 1 from unnest($2 || $3 || $4) x where t.response_body::text like ''%'' || x::text || ''%'')'
      else 'false' end;
    if p_type = 'reset' then condition := 'true'; end if;
    execute format('select coalesce(jsonb_agg(to_jsonb(t) order by to_jsonb(t)::text), ''[]''::jsonb) from public.%I t where t.owner_id = $1 and (%s)',spec[1],condition)
      into table_rows using p_owner, app_ids, job_ids, doc_ids, question_ids, notification_ids;
    rows := rows || jsonb_build_object(spec[1],table_rows);
    counts := counts || jsonb_build_object(spec[1],jsonb_array_length(table_rows));
  end loop;
  select blockers || coalesce(jsonb_agg(jsonb_build_object('id',x.id,'label',x.label,'reason','running_job') order by x.id),'[]') into blockers from (
    select id, '분석 실행 중' as label from public.analysis_jobs where owner_id = p_owner and id = any(job_ids) and status in ('queued','running','retrying')
    union all select id, 'PDF 추출 중' from public.document_versions where owner_id = p_owner and id = any(doc_ids) and extraction_status = 'processing'
    union all select id, 'Slack 전송 중' from public.slack_notifications where owner_id = p_owner and id = any(notification_ids) and status = 'dispatching'
    union all select id, '공고 수집 중' from public.job_posting_collection_runs where owner_id = p_owner and status in ('queued','running')
      and (p_type = 'reset' or job_posting_id in (select job_posting_id from public.applications where owner_id = p_owner and id = any(app_ids)))
  ) x;
  select coalesce(jsonb_agg(jsonb_build_object('id',a.id,'label',p.company_name || ' · ' || p.title) order by a.id),'[]') into labels
    from public.applications a join public.job_postings p on p.id = a.job_posting_id where a.owner_id = p_owner and a.id = any(app_ids);
  return jsonb_build_object('rows',rows,'targetType',p_type,'targetId',p_id,
    'fingerprint',encode(extensions.digest((rows::text || blockers::text),'sha256'),'hex'),
    'allowed',jsonb_array_length(blockers) = 0,'blockers',blockers,'applications',labels,'counts',counts,
    'preserves',case p_type when 'application' then jsonb_build_array('연결 문서·PDF','공유 채용공고') when 'document' then jsonb_build_array('다른 문서·PDF','공유 채용공고') else jsonb_build_array('관리자 계정·인증 설정','블로그 게시글','외부 Credential') end);
end;
$$;

create function public.preview_career_deletion(p_owner_id uuid, p_target_type text, p_target_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
begin
  perform pg_advisory_xact_lock(hashtextextended(p_owner_id::text, 610063));
  return private.career_deletion_graph(p_owner_id,p_target_type,p_target_id) - 'rows';
end;
$$;

create function public.delete_career_resource(p_owner_id uuid, p_target_type text, p_target_id uuid, p_fingerprint text)
returns public.career_deletion_operations language plpgsql security definer set search_path = '' as $$
declare graph jsonb; operation public.career_deletion_operations; table_name text;
begin
  perform pg_advisory_xact_lock(hashtextextended(p_owner_id::text, 610063));
  select * into operation from public.career_deletion_operations where owner_id = p_owner_id
    and target_type = p_target_type and target_id is not distinct from p_target_id and fingerprint = p_fingerprint;
  if found then return operation; end if;
  if p_target_type = 'reset' and not exists(select 1 from public.career_ops_maintenance where owner_id = p_owner_id and enabled) then raise exception 'maintenance_required'; end if;
  graph := private.career_deletion_graph(p_owner_id,p_target_type,p_target_id);
  if graph->>'fingerprint' <> p_fingerprint then raise exception 'deletion_preview_changed'; end if;
  if not (graph->>'allowed')::boolean then raise exception 'deletion_blocked'; end if;
  insert into private.career_purge_context values (txid_current(),p_owner_id);
  insert into public.career_deletion_operations(owner_id,target_type,target_id,fingerprint,status)
    values(p_owner_id,p_target_type,p_target_id,p_fingerprint,
      case when jsonb_array_length(graph->'rows'->'document_versions') > 0 then 'pending' else 'completed' end)
    returning * into operation;
  insert into public.career_storage_cleanup(owner_id,operation_id,storage_path)
    select p_owner_id,operation.id,d->>'storage_path' from jsonb_array_elements(graph->'rows'->'document_versions') d;
  for table_name in select name from unnest(array['slack_job_threads','slack_notifications','interview_notes','interview_answers',
    'interview_checklist_items','analysis_requirement_reviews','analysis_reviews','interview_questions','analysis_results',
    'analysis_step_executions','analysis_job_events','analysis_jobs','application_status_history','application_documents',
    'api_idempotency_records','applications','document_evidence_reviews','document_analysis_profiles',
    'document_publications','document_versions','job_posting_analysis_profiles','job_posting_collection_runs','job_posting_snapshots','job_postings']::text[]) t(name) loop
    execute format('delete from public.%I t where t.owner_id = $1 and to_jsonb(t) in (select value from jsonb_array_elements($2))',table_name)
      using p_owner_id,graph->'rows'->table_name;
  end loop;
  if operation.status = 'completed' then
    update public.career_deletion_operations set completed_at = now() where id = operation.id returning * into operation;
  end if;
  delete from private.career_purge_context where transaction_id = txid_current();
  return operation;
end;
$$;

create function public.set_career_maintenance(p_owner_id uuid, p_enabled boolean)
returns boolean language plpgsql security definer set search_path = '' as $$
declare graph jsonb;
begin
  perform pg_advisory_xact_lock(hashtextextended(p_owner_id::text, 610063));
  if p_enabled then
    if exists(select 1 from public.career_ops_maintenance where owner_id = p_owner_id and enabled) then
      raise exception 'maintenance_already_enabled';
    end if;
    graph := private.career_deletion_graph(p_owner_id,'reset',null);
    if not (graph->>'allowed')::boolean then raise exception 'running_jobs'; end if;
  end if;
  insert into public.career_ops_maintenance(owner_id,enabled) values(p_owner_id,p_enabled)
    on conflict(owner_id) do update set enabled = excluded.enabled, updated_at = now();
  return p_enabled;
end;
$$;

create function public.claim_career_storage_cleanup(p_owner_id uuid, p_limit integer default 20)
returns setof public.career_storage_cleanup language sql security definer set search_path = '' as $$
  update public.career_storage_cleanup set status = 'processing', attempts = attempts + 1, updated_at = now()
  where id in (select id from public.career_storage_cleanup where owner_id = p_owner_id and
    (status in ('pending','failed') or status = 'processing' and updated_at < now() - interval '10 minutes')
    and (attempts < 5 or updated_at < now() - interval '1 day') order by updated_at limit least(greatest(p_limit,1),100) for update skip locked)
  returning *;
$$;
create function public.finish_career_storage_cleanup(p_owner_id uuid, p_cleanup_id uuid, p_attempt integer, p_success boolean)
returns void language plpgsql security definer set search_path = '' as $$
declare operation_id uuid;
begin
  select s.operation_id into operation_id from public.career_storage_cleanup s
    where s.owner_id = p_owner_id and s.id = p_cleanup_id;
  if not found then return; end if;
  -- Serialize completion of sibling objects before taking the aggregate snapshot.
  perform 1 from public.career_deletion_operations where owner_id = p_owner_id and id = operation_id for update;
  update public.career_storage_cleanup set status = case when p_success then 'completed' else 'failed' end,
    error = case when p_success then null else 'STORAGE_DELETE_FAILED' end, updated_at = now()
    where owner_id = p_owner_id and id = p_cleanup_id and status = 'processing' and attempts = p_attempt
    ;
  if not found then return; end if;
  update public.career_deletion_operations o set
    status = case when exists(select 1 from public.career_storage_cleanup s where s.operation_id = o.id and status = 'failed') then 'failed'
      when exists(select 1 from public.career_storage_cleanup s where s.operation_id = o.id and status <> 'completed') then 'pending' else 'completed' end,
    error = case when exists(select 1 from public.career_storage_cleanup s where s.operation_id = o.id and status = 'failed') then 'STORAGE_DELETE_FAILED' else null end,
    completed_at = case when not exists(select 1 from public.career_storage_cleanup s where s.operation_id = o.id and status <> 'completed') then now() else null end
    where o.owner_id = p_owner_id and o.id = operation_id;
end;
$$;

create function public.enqueue_career_reset_objects(p_owner_id uuid, p_operation_id uuid, p_paths text[])
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not exists(select 1 from public.career_deletion_operations where owner_id = p_owner_id and id = p_operation_id and target_type = 'reset')
    or not exists(select 1 from public.career_ops_maintenance where owner_id = p_owner_id and enabled) then raise exception 'invalid_reset_operation'; end if;
  if exists(select 1 from unnest(p_paths) p where p is null or p !~ ('^' || p_owner_id::text || '/(resume|portfolio)/[^/]+[.]pdf$')
    or p like '%..%' or length(p) > 1024) then raise exception 'invalid_storage_path'; end if;
  insert into public.career_storage_cleanup(owner_id,operation_id,storage_path)
    select p_owner_id,p_operation_id,p from unnest(p_paths) p on conflict(operation_id,storage_path) do nothing;
  if exists(select 1 from public.career_storage_cleanup where operation_id = p_operation_id and status <> 'completed') then
    update public.career_deletion_operations set status = 'pending', completed_at = null where id = p_operation_id;
  end if;
end;
$$;
revoke all on function public.enqueue_career_reset_objects(uuid,uuid,text[]) from public, anon, authenticated;
grant execute on function public.enqueue_career_reset_objects(uuid,uuid,text[]) to service_role;

revoke all on function private.career_purge_allowed(uuid), private.guard_career_mutation(), private.guard_career_storage_upload(), private.career_deletion_graph(uuid,text,uuid) from public, anon, authenticated;
revoke all on function public.preview_career_deletion(uuid,text,uuid), public.delete_career_resource(uuid,text,uuid,text), public.set_career_maintenance(uuid,boolean), public.claim_career_storage_cleanup(uuid,integer), public.finish_career_storage_cleanup(uuid,uuid,integer,boolean) from public, anon, authenticated;
grant execute on function private.career_purge_allowed(uuid) to service_role;
grant execute on function public.preview_career_deletion(uuid,text,uuid), public.delete_career_resource(uuid,text,uuid,text), public.set_career_maintenance(uuid,boolean), public.claim_career_storage_cleanup(uuid,integer), public.finish_career_storage_cleanup(uuid,uuid,integer,boolean) to service_role;
