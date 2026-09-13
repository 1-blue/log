begin;

insert into auth.users (
  id, instance_id, aud, role, email, encrypted_password,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values (
  '00000000-0000-4000-8000-000000000211',
  '00000000-0000-0000-0000-000000000000',
  'authenticated', 'authenticated', 'analysis-integration@example.com', '',
  '{"provider":"email","providers":["email"]}', '{}',
  pg_catalog.now(), pg_catalog.now()
) on conflict (id) do nothing;

insert into public.document_versions (
  id, owner_id, document_type, label, original_filename, storage_path,
  mime_type, file_size, content_hash, extracted_text, extraction_status
) values
  (
    '00000000-0000-4000-8000-000000000212',
    '00000000-0000-4000-8000-000000000211', 'resume', '분석 이력서',
    'resume.pdf',
    '00000000-0000-4000-8000-000000000211/resume/00000000-0000-4000-8000-000000000212.pdf',
    'application/pdf', 100, pg_catalog.repeat('a', 64),
    'Cloudflare Worker API를 구현했습니다.', 'ready'
  ),
  (
    '00000000-0000-4000-8000-000000000213',
    '00000000-0000-4000-8000-000000000211', 'portfolio', '분석 포트폴리오',
    'portfolio.pdf',
    '00000000-0000-4000-8000-000000000211/portfolio/00000000-0000-4000-8000-000000000213.pdf',
    'application/pdf', 100, pg_catalog.repeat('b', 64),
    'n8n 자동화 Workflow를 운영했습니다.', 'ready'
  );

insert into public.job_postings (
  id, owner_id, source, external_id, canonical_url, company_name, title
) values (
  '00000000-0000-4000-8000-000000000214',
  '00000000-0000-4000-8000-000000000211', 'wanted', '384409',
  'https://www.wanted.co.kr/wd/384409', '미리디', 'AX Engineer - Infra'
);

insert into public.applications (
  id, owner_id, job_posting_id, attempt_number, status
) values (
  '00000000-0000-4000-8000-000000000215',
  '00000000-0000-4000-8000-000000000211',
  '00000000-0000-4000-8000-000000000214', 1, 'interested'
);

insert into public.application_documents (
  application_id, owner_id, document_type, document_version_id
) values
  (
    '00000000-0000-4000-8000-000000000215',
    '00000000-0000-4000-8000-000000000211', 'resume',
    '00000000-0000-4000-8000-000000000212'
  ),
  (
    '00000000-0000-4000-8000-000000000215',
    '00000000-0000-4000-8000-000000000211', 'portfolio',
    '00000000-0000-4000-8000-000000000213'
  );

insert into public.job_posting_snapshots (
  id, owner_id, job_posting_id, source, raw_content, normalized_content,
  content_hash, parser_version, source_metadata, fetched_at
) values (
  '00000000-0000-4000-8000-000000000216',
  '00000000-0000-4000-8000-000000000211',
  '00000000-0000-4000-8000-000000000214', 'wanted_json_ld',
  'Cloudflare Worker 운영 경험', 'Cloudflare Worker 운영 경험',
  pg_catalog.repeat('c', 64), 'wanted-jsonld-v1', '{}', pg_catalog.now()
);

insert into public.analysis_jobs (
  id, owner_id, application_id, job_posting_id, job_posting_snapshot_id,
  resume_version_id, portfolio_version_id, job_posting_text,
  job_posting_content_hash, resume_text, resume_content_hash,
  resume_original_length, portfolio_text, portfolio_content_hash,
  portfolio_original_length, request_id
) values (
  '00000000-0000-4000-8000-000000000217',
  '00000000-0000-4000-8000-000000000211',
  '00000000-0000-4000-8000-000000000215',
  '00000000-0000-4000-8000-000000000214',
  '00000000-0000-4000-8000-000000000216',
  '00000000-0000-4000-8000-000000000212',
  '00000000-0000-4000-8000-000000000213',
  'Cloudflare Worker 운영 경험', pg_catalog.repeat('c', 64),
  'Cloudflare Worker API를 구현했습니다.', pg_catalog.repeat('d', 64), 28,
  'n8n 자동화 Workflow를 운영했습니다.', pg_catalog.repeat('e', 64), 29,
  '00000000-0000-4000-8000-000000000218'
);

do $$
begin
  begin
    insert into public.analysis_jobs (
      owner_id, application_id, job_posting_id, job_posting_snapshot_id,
      resume_version_id, portfolio_version_id, job_posting_text,
      job_posting_content_hash, resume_text, resume_content_hash,
      resume_original_length, portfolio_text, portfolio_content_hash,
      portfolio_original_length, request_id
    ) values (
      '00000000-0000-4000-8000-000000000211',
      '00000000-0000-4000-8000-000000000215',
      '00000000-0000-4000-8000-000000000214',
      '00000000-0000-4000-8000-000000000216',
      '00000000-0000-4000-8000-000000000212',
      '00000000-0000-4000-8000-000000000213',
      '공고', pg_catalog.repeat('c', 64), '이력서', pg_catalog.repeat('d', 64), 3,
      '포트폴리오', pg_catalog.repeat('e', 64), 6,
      '00000000-0000-4000-8000-000000000219'
    );
    raise exception 'concurrent analysis was accepted';
  exception when unique_violation then null;
  end;
end;
$$;

select public.begin_analysis_attempt(
  '00000000-0000-4000-8000-000000000217',
  '00000000-0000-4000-8000-000000000211',
  '00000000-0000-4000-8000-000000000221'
);
select public.record_analysis_event(
  p_analysis_job_id := '00000000-0000-4000-8000-000000000217',
  p_event_id := '00000000-0000-4000-8000-000000000222',
  p_run_attempt := 1, p_event_type := 'heartbeat', p_status := 'running',
  p_stage := 'extracting', p_step := 'job_facts', p_step_attempt := 1
);
select public.record_analysis_event(
  p_analysis_job_id := '00000000-0000-4000-8000-000000000217',
  p_event_id := '00000000-0000-4000-8000-000000000223',
  p_run_attempt := 1, p_event_type := 'retrying', p_status := 'retrying',
  p_stage := 'extracting', p_step := 'job_facts', p_step_attempt := 1,
  p_retry_at := pg_catalog.now() + interval '2 seconds',
  p_error_code := 'OPENAI_UNAVAILABLE',
  p_error_message := '일시적인 OpenAI 오류', p_error_retryable := true
);
select public.record_analysis_event(
  p_analysis_job_id := '00000000-0000-4000-8000-000000000217',
  p_event_id := '00000000-0000-4000-8000-000000000225',
  p_run_attempt := 1, p_event_type := 'progress', p_status := 'running',
  p_stage := 'matching', p_step := 'profile_comparison', p_step_attempt := 1
);

select public.complete_analysis_job(
  '00000000-0000-4000-8000-000000000217',
  '00000000-0000-4000-8000-000000000220', 1, '1.0.0',
  '{"summary":"공고 사실"}',
  '{"fitScore":100}',
  '[{"step":"job_facts","model":"gpt-5.4-mini-2026-03-17","promptVersion":"job-facts-v1","responseId":"resp_1","inputTokens":10,"outputTokens":5,"latencyMs":100,"attemptCount":2},{"step":"profile_comparison","model":"gpt-5.4-mini-2026-03-17","promptVersion":"profile-match-v1","responseId":"resp_2","inputTokens":20,"outputTokens":10,"latencyMs":200,"attemptCount":1}]',
  pg_catalog.now()
);

do $$
declare result_count integer; execution_count integer; current_status public.analysis_job_status; attempts integer;
begin
  select status, attempt_count into current_status, attempts from public.analysis_jobs
   where id = '00000000-0000-4000-8000-000000000217';
  select pg_catalog.count(*) into result_count from public.analysis_results
   where analysis_job_id = '00000000-0000-4000-8000-000000000217';
  select pg_catalog.count(*) into execution_count from public.analysis_step_executions
   where analysis_job_id = '00000000-0000-4000-8000-000000000217';
  if current_status <> 'succeeded' or attempts <> 1 or result_count <> 1 or execution_count <> 2 then
    raise exception 'analysis completion was not atomic';
  end if;

  perform public.complete_analysis_job(
    '00000000-0000-4000-8000-000000000217',
    '00000000-0000-4000-8000-000000000220', 1, '1.0.0', '{}', '{}', '[]',
    pg_catalog.now()
  );

  begin
    update public.analysis_results set result = '{}' where analysis_job_id = '00000000-0000-4000-8000-000000000217';
    raise exception 'immutable analysis result was updated';
  exception when check_violation then null;
  end;
end;
$$;

select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-000000000211","role":"authenticated"}',
  true
);
set local role authenticated;

do $$
begin
  if (select pg_catalog.count(*) from public.analysis_jobs) <> 1
    or (select pg_catalog.count(*) from public.analysis_results) <> 1
    or (select pg_catalog.count(*) from public.analysis_step_executions) <> 2 then
    raise exception 'owner RLS cannot read complete analysis';
  end if;
end;
$$;

select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-000000000299","role":"authenticated"}',
  true
);

do $$
begin
  if (select pg_catalog.count(*) from public.analysis_jobs) <> 0
    or (select pg_catalog.count(*) from public.analysis_results) <> 0
    or (select pg_catalog.count(*) from public.analysis_step_executions) <> 0 then
    raise exception 'analysis RLS exposed another owner data';
  end if;
  begin
    insert into public.analysis_results (
      analysis_job_id, owner_id, schema_version, job_posting_facts, result, completed_event_id
    ) values (
      '00000000-0000-4000-8000-000000000217',
      '00000000-0000-4000-8000-000000000211', '1.0.0', '{}', '{}',
      '00000000-0000-4000-8000-000000000224'
    );
    raise exception 'authenticated role inserted an analysis result';
  exception when insufficient_privilege then null;
  end;
end;
$$;

reset role;

rollback;
