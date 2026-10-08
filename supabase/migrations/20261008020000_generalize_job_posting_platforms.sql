alter table public.job_postings alter column source type text using source::text;
alter table public.job_postings drop constraint job_postings_external_id_check;
alter table public.job_postings drop constraint job_postings_canonical_url_check;
alter table public.job_postings add constraint job_postings_source_code_check
  check (source ~ '^[a-z][a-z0-9_]{0,39}$');
alter table public.job_postings add constraint job_postings_external_id_length
  check (char_length(external_id) between 1 and 200);
alter table public.job_postings add constraint job_postings_https_url_check
  check (char_length(canonical_url) <= 2000 and canonical_url ~ '^https://[^/@?#[:space:]]+[^#[:space:]]*$');
create unique index job_postings_owner_url_key on public.job_postings(owner_id, canonical_url);

-- Keep the legacy enum RPC for old clients. Use a distinct name: PostgREST
-- cannot disambiguate overloads with the same JSON argument names.
create function public.create_application_with_posting_v2(
  p_owner_id uuid, p_source text, p_external_id text, p_canonical_url text,
  p_company_name text, p_title text, p_status public.application_status,
  p_applied_on date, p_interview_at timestamptz, p_note text,
  p_resume_version_id uuid, p_portfolio_version_id uuid
)
returns public.applications language plpgsql security invoker set search_path = '' as $$
declare posting public.job_postings; application public.applications;
begin
  if private.application_status_requires_documents(p_status)
    and (p_resume_version_id is null or p_portfolio_version_id is null) then
    raise exception using errcode = '23514', message = 'Submitted applications require resume and portfolio versions';
  end if;
  insert into public.job_postings(owner_id, source, external_id, canonical_url, company_name, title)
    values(p_owner_id, p_source, p_external_id, p_canonical_url, btrim(p_company_name), btrim(p_title))
    returning * into posting;
  insert into public.applications(owner_id, job_posting_id, attempt_number, status, applied_on, interview_at, note)
    values(p_owner_id, posting.id, 1, p_status, p_applied_on, p_interview_at, nullif(btrim(p_note), ''))
    returning * into application;
  if p_resume_version_id is not null then
    insert into public.application_documents(application_id, owner_id, document_type, document_version_id)
      values(application.id, p_owner_id, 'resume', p_resume_version_id);
  end if;
  if p_portfolio_version_id is not null then
    insert into public.application_documents(application_id, owner_id, document_type, document_version_id)
      values(application.id, p_owner_id, 'portfolio', p_portfolio_version_id);
  end if;
  if private.application_status_requires_documents(p_status) then
    update public.applications set documents_locked_at = now() where id = application.id returning * into application;
  end if;
  return application;
end;
$$;
revoke all on function public.create_application_with_posting_v2(uuid,text,text,text,text,text,public.application_status,date,timestamptz,text,uuid,uuid)
  from public, anon, authenticated;
grant execute on function public.create_application_with_posting_v2(uuid,text,text,text,text,text,public.application_status,date,timestamptz,text,uuid,uuid)
  to service_role;

create function public.update_job_posting_details_v2(
  p_owner_id uuid, p_job_posting_id uuid, p_company_name text, p_title text, p_source text
)
returns public.job_postings language plpgsql security invoker set search_path = '' as $$
begin
  update public.job_postings set source = p_source where id = p_job_posting_id and owner_id = p_owner_id;
  if not found then raise exception using errcode = 'P0002', message = 'Job posting not found'; end if;
  return public.update_job_posting_details(p_owner_id, p_job_posting_id, p_company_name, p_title);
end;
$$;
revoke all on function public.update_job_posting_details_v2(uuid,uuid,text,text,text) from public, anon, authenticated;
grant execute on function public.update_job_posting_details_v2(uuid,uuid,text,text,text) to service_role;

-- Teach existing metadata/Slack functions about the new neutral placeholder
-- without changing their delivery policy or old-client compatibility.
do $$
declare definition text;
begin
  definition := pg_get_functiondef('private.enqueue_new_job_posting_slack()'::regprocedure);
  if position('new.title = ''Wanted 공고 '' || new.external_id' in definition) = 0 then
    raise exception 'pending_posting_policy_not_found';
  end if;
  execute replace(definition, 'new.title = ''Wanted 공고 '' || new.external_id',
    '(new.title = ''Wanted 공고 '' || new.external_id or new.title = ''공고 확인 중'')');
  definition := pg_get_functiondef('public.update_job_posting_details(uuid,uuid,text,text)'::regprocedure);
  if position('posting.title <> ''Wanted 공고 '' || posting.external_id' in definition) = 0 then
    raise exception 'pending_posting_update_policy_not_found';
  end if;
  execute replace(definition, 'posting.title <> ''Wanted 공고 '' || posting.external_id',
    'posting.title <> ''Wanted 공고 '' || posting.external_id and posting.title <> ''공고 확인 중''');
end;
$$;

alter type public.job_posting_collection_error_code add value 'AUTOMATIC_COLLECTION_UNSUPPORTED';
alter type public.job_posting_collection_error_code add value 'AI_STRUCTURING_FAILED';
