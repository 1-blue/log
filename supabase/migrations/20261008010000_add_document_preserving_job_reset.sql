-- A separate service-only reset path. Document/OCR/profile/usage rows are never
-- added to its deletion graph, and storage cleanup is never scheduled here.
alter table public.career_deletion_operations
  drop constraint career_deletion_operations_target_type_check;
alter table public.career_deletion_operations
  add constraint career_deletion_operations_target_type_check
  check (target_type in ('application', 'document', 'reset', 'job_reset'));

create function private.career_preserved_fingerprint(p_owner uuid)
returns text language plpgsql security definer set search_path = '' as $$
declare state jsonb := '{}'; records jsonb; table_name text;
begin
  foreach table_name in array array['document_versions', 'document_publications',
    'document_analysis_profiles', 'document_evidence_reviews', 'ai_usage_calls',
    'ai_balance_baselines'] loop
    execute format('select coalesce(jsonb_agg(to_jsonb(t) order by to_jsonb(t)::text), ''[]''::jsonb) from public.%I t where owner_id = $1', table_name)
      into records using p_owner;
    state := state || jsonb_build_object(table_name, records);
  end loop;
  select coalesce(jsonb_agg(to_jsonb(n) order by to_jsonb(n)::text), '[]'::jsonb)
    into records from public.slack_notifications n
    where owner_id = p_owner and document_version_id is not null;
  state := state || jsonb_build_object('document_notifications', records);
  select coalesce(jsonb_agg(to_jsonb(i) order by to_jsonb(i)::text), '[]'::jsonb)
    into records from public.api_idempotency_records i where owner_id=p_owner
    and request_path !~ '^/v1/(applications|job-postings|analysis-jobs|analyses|interviews)(/|$)';
  state := state || jsonb_build_object('preserved_idempotency', records);
  return encode(extensions.digest(state::text, 'sha256'), 'hex');
end;
$$;

create function private.career_job_reset_graph(p_owner uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  original jsonb := private.career_deletion_graph(p_owner, 'reset', null);
  rows jsonb := '{}'; counts jsonb := '{}'; records jsonb; table_name text;
  preserved text := private.career_preserved_fingerprint(p_owner);
begin
  -- Keep the existing full-reset in-flight guards, including OCR. Maintenance
  -- must freeze a stable document set even though those documents are retained.
  foreach table_name in array array['slack_job_threads', 'slack_notifications',
    'interview_notes', 'interview_answers', 'interview_checklist_items',
    'analysis_requirement_reviews', 'analysis_reviews', 'interview_questions',
    'analysis_results', 'analysis_step_executions', 'analysis_job_events',
    'analysis_jobs', 'application_status_history', 'application_documents',
    'api_idempotency_records', 'applications', 'job_posting_analysis_profiles',
    'job_posting_collection_runs', 'job_posting_snapshots', 'job_postings'] loop
    records := original->'rows'->table_name;
    if table_name = 'slack_notifications' then
      select coalesce(jsonb_agg(value order by value::text), '[]'::jsonb)
        into records from jsonb_array_elements(records)
        where value->>'document_version_id' is null;
    elsif table_name = 'api_idempotency_records' then
      -- Do not erase document publication/upload or balance idempotency keys.
      select coalesce(jsonb_agg(value order by value::text), '[]'::jsonb)
        into records from jsonb_array_elements(records)
        where value->>'request_path' ~ '^/v1/(applications|job-postings|analysis-jobs|analyses|interviews)(/|$)';
    end if;
    rows := rows || jsonb_build_object(table_name, records);
    counts := counts || jsonb_build_object(table_name, jsonb_array_length(records));
  end loop;
  return jsonb_build_object('rows', rows, 'targetType', 'job_reset', 'targetId', null,
    'allowed', original->'allowed', 'blockers', original->'blockers',
    'applications', original->'applications', 'counts', counts,
    'preservedFingerprint', preserved,
    'fingerprint', encode(extensions.digest(rows::text || (original->'blockers')::text || preserved, 'sha256'), 'hex'),
    'preserves', jsonb_build_array('문서·PDF·OCR', '문서별 분석·검토', '문서 공개·기본 버전 설정',
      '문서 Slack 기록', 'AI 사용량·잔액', '계정·인증·Credential·블로그'));
end;
$$;

create function public.preview_career_job_reset(p_owner_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
begin
  perform pg_advisory_xact_lock(hashtextextended(p_owner_id::text, 610063));
  if not exists(select 1 from auth.users where id = p_owner_id) then raise exception 'owner_not_found'; end if;
  return private.career_job_reset_graph(p_owner_id) - 'rows';
end;
$$;

create function public.reset_career_job_data(p_owner_id uuid, p_fingerprint text)
returns public.career_deletion_operations language plpgsql security definer set search_path = '' as $$
declare graph jsonb; operation public.career_deletion_operations;
begin
  perform pg_advisory_xact_lock(hashtextextended(p_owner_id::text, 610063));
  if not exists(select 1 from public.career_ops_maintenance where owner_id = p_owner_id and enabled) then
    raise exception 'maintenance_required';
  end if;
  select * into operation from public.career_deletion_operations
    where owner_id = p_owner_id and target_type = 'job_reset' and fingerprint = p_fingerprint;
  if found then return operation; end if;
  graph := private.career_job_reset_graph(p_owner_id);
  if graph->>'fingerprint' <> p_fingerprint then raise exception 'deletion_preview_changed'; end if;
  if not (graph->>'allowed')::boolean then raise exception 'deletion_blocked'; end if;
  insert into private.career_purge_context values (txid_current(), p_owner_id);
  insert into public.career_deletion_operations(owner_id, target_type, fingerprint, status, completed_at)
    values(p_owner_id, 'job_reset', p_fingerprint, 'completed', now()) returning * into operation;
  -- Explicit child-first allowlist: documents and Storage cannot be touched.
  delete from public.slack_job_threads where owner_id=p_owner_id;
  delete from public.slack_notifications where owner_id=p_owner_id and document_version_id is null;
  delete from public.interview_notes where owner_id=p_owner_id;
  delete from public.interview_answers where owner_id=p_owner_id;
  delete from public.interview_checklist_items where owner_id=p_owner_id;
  delete from public.analysis_requirement_reviews where owner_id=p_owner_id;
  delete from public.analysis_reviews where owner_id=p_owner_id;
  delete from public.interview_questions where owner_id=p_owner_id;
  delete from public.analysis_results where owner_id=p_owner_id;
  delete from public.analysis_step_executions where owner_id=p_owner_id;
  delete from public.analysis_job_events where owner_id=p_owner_id;
  delete from public.analysis_jobs where owner_id=p_owner_id;
  delete from public.application_status_history where owner_id=p_owner_id;
  delete from public.application_documents where owner_id=p_owner_id;
  delete from public.api_idempotency_records where owner_id=p_owner_id
    and request_path ~ '^/v1/(applications|job-postings|analysis-jobs|analyses|interviews)(/|$)';
  delete from public.applications where owner_id=p_owner_id;
  delete from public.job_posting_analysis_profiles where owner_id=p_owner_id;
  delete from public.job_posting_collection_runs where owner_id=p_owner_id;
  delete from public.job_posting_snapshots where owner_id=p_owner_id;
  delete from public.job_postings where owner_id=p_owner_id;
  if private.career_preserved_fingerprint(p_owner_id) <> graph->>'preservedFingerprint' then
    raise exception 'preserved_data_changed'; -- rollback the entire reset
  end if;
  delete from private.career_purge_context where transaction_id = txid_current();
  return operation;
end;
$$;

revoke all on function private.career_preserved_fingerprint(uuid), private.career_job_reset_graph(uuid)
  from public, anon, authenticated, service_role;
revoke all on function public.preview_career_job_reset(uuid), public.reset_career_job_data(uuid, text)
  from public, anon, authenticated;
grant execute on function public.preview_career_job_reset(uuid), public.reset_career_job_data(uuid, text)
  to service_role;
