begin;

set local search_path = public, extensions;

select plan(15);

select has_table('public', 'analysis_job_events', 'analysis events table exists');
select is(
  pg_catalog.has_function_privilege(
    'authenticated',
    'public.begin_analysis_attempt(uuid,uuid,uuid)',
    'execute'
  ),
  false,
  'authenticated clients cannot start workflow attempts directly'
);

insert into auth.users (
  id, instance_id, aud, role, email, encrypted_password,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values (
  '00000000-0000-4000-8000-000000000301',
  '00000000-0000-0000-0000-000000000000',
  'authenticated', 'authenticated', 'async-control@example.com', '',
  '{"provider":"email","providers":["email"]}', '{}',
  pg_catalog.now(), pg_catalog.now()
);

insert into public.document_versions (
  id, owner_id, document_type, label, original_filename, storage_path,
  mime_type, file_size, content_hash, extracted_text, extraction_status
) values
  (
    '00000000-0000-4000-8000-000000000302',
    '00000000-0000-4000-8000-000000000301', 'resume', '이력서',
    'resume.pdf',
    '00000000-0000-4000-8000-000000000301/resume/00000000-0000-4000-8000-000000000302.pdf',
    'application/pdf', 100, pg_catalog.repeat('a', 64), '이력서 본문', 'ready'
  ),
  (
    '00000000-0000-4000-8000-000000000303',
    '00000000-0000-4000-8000-000000000301', 'portfolio', '포트폴리오',
    'portfolio.pdf',
    '00000000-0000-4000-8000-000000000301/portfolio/00000000-0000-4000-8000-000000000303.pdf',
    'application/pdf', 100, pg_catalog.repeat('b', 64), '포트폴리오 본문', 'ready'
  );

insert into public.job_postings (
  id, owner_id, source, external_id, canonical_url, company_name, title
) values (
  '00000000-0000-4000-8000-000000000304',
  '00000000-0000-4000-8000-000000000301', 'wanted', '384409',
  'https://www.wanted.co.kr/wd/384409', '미리디', 'AX Engineer - Infra'
);

insert into public.job_posting_snapshots (
  id, owner_id, job_posting_id, source, raw_content, normalized_content,
  content_hash, parser_version, source_metadata, fetched_at
) values (
  '00000000-0000-4000-8000-000000000305',
  '00000000-0000-4000-8000-000000000301',
  '00000000-0000-4000-8000-000000000304', 'manual', '공고 본문', '공고 본문',
  pg_catalog.repeat('c', 64), 'manual-v1', '{}', pg_catalog.now()
);

insert into public.applications (
  id, owner_id, job_posting_id, attempt_number, status
) values
  (
    '00000000-0000-4000-8000-000000000306',
    '00000000-0000-4000-8000-000000000301',
    '00000000-0000-4000-8000-000000000304', 1, 'interested'
  ),
  (
    '00000000-0000-4000-8000-000000000307',
    '00000000-0000-4000-8000-000000000301',
    '00000000-0000-4000-8000-000000000304', 2, 'interested'
  ),
  (
    '00000000-0000-4000-8000-000000000308',
    '00000000-0000-4000-8000-000000000301',
    '00000000-0000-4000-8000-000000000304', 3, 'interested'
  );

insert into public.analysis_jobs (
  id, owner_id, application_id, job_posting_id, job_posting_snapshot_id,
  resume_version_id, portfolio_version_id, job_posting_text,
  job_posting_content_hash, resume_text, resume_content_hash,
  resume_original_length, portfolio_text, portfolio_content_hash,
  portfolio_original_length, request_id
) values (
  '00000000-0000-4000-8000-000000000309',
  '00000000-0000-4000-8000-000000000301',
  '00000000-0000-4000-8000-000000000306',
  '00000000-0000-4000-8000-000000000304',
  '00000000-0000-4000-8000-000000000305',
  '00000000-0000-4000-8000-000000000302',
  '00000000-0000-4000-8000-000000000303',
  '공고 본문', pg_catalog.repeat('c', 64),
  '이력서 본문', pg_catalog.repeat('d', 64), 6,
  '포트폴리오 본문', pg_catalog.repeat('e', 64), 8,
  '00000000-0000-4000-8000-000000000310'
);

select public.begin_analysis_attempt(
  '00000000-0000-4000-8000-000000000309',
  '00000000-0000-4000-8000-000000000301',
  '00000000-0000-4000-8000-000000000311'
);
select is(
  (select attempt_count from public.analysis_jobs where id = '00000000-0000-4000-8000-000000000309'),
  1,
  'the first workflow run starts on the same analysis job'
);

select public.record_analysis_event(
  p_analysis_job_id := '00000000-0000-4000-8000-000000000309',
  p_event_id := '00000000-0000-4000-8000-000000000312',
  p_run_attempt := 1,
  p_event_type := 'heartbeat',
  p_status := 'running',
  p_stage := 'extracting',
  p_step := 'job_facts',
  p_step_attempt := 1,
  p_message := '공고 분석 중'
);
select is(
  (select status::text from public.analysis_jobs where id = '00000000-0000-4000-8000-000000000309'),
  'running',
  'a heartbeat starts and refreshes the active run'
);

select public.record_analysis_event(
  p_analysis_job_id := '00000000-0000-4000-8000-000000000309',
  p_event_id := '00000000-0000-4000-8000-000000000313',
  p_run_attempt := 1,
  p_event_type := 'retrying',
  p_status := 'retrying',
  p_stage := 'extracting',
  p_step := 'job_facts',
  p_step_attempt := 1,
  p_retry_at := pg_catalog.now() + interval '3 seconds',
  p_error_code := 'OPENAI_RATE_LIMITED',
  p_error_message := '호출 제한으로 대기합니다.',
  p_error_retryable := true
);
select ok(
  (select retry_at is not null from public.analysis_jobs where id = '00000000-0000-4000-8000-000000000309'),
  'retrying records the next step attempt time'
);

select public.record_analysis_event(
  p_analysis_job_id := '00000000-0000-4000-8000-000000000309',
  p_event_id := '00000000-0000-4000-8000-000000000314',
  p_run_attempt := 1,
  p_event_type := 'failed',
  p_status := 'failed',
  p_stage := 'extracting',
  p_step := 'job_facts',
  p_step_attempt := 2,
  p_error_code := 'OPENAI_UNAVAILABLE',
  p_error_message := 'OpenAI 응답을 받지 못했습니다.',
  p_error_retryable := true
);
select is(
  (select status::text from public.analysis_jobs where id = '00000000-0000-4000-8000-000000000309'),
  'failed',
  'an exhausted step retry makes the workflow run fail'
);

select public.begin_analysis_attempt(
  '00000000-0000-4000-8000-000000000309',
  '00000000-0000-4000-8000-000000000301',
  '00000000-0000-4000-8000-000000000315'
);
select is(
  (select attempt_count from public.analysis_jobs where id = '00000000-0000-4000-8000-000000000309'),
  2,
  'manual retry starts the second run without creating another job'
);

select public.record_analysis_event(
  p_analysis_job_id := '00000000-0000-4000-8000-000000000309',
  p_event_id := '00000000-0000-4000-8000-000000000316',
  p_run_attempt := 2,
  p_event_type := 'failed',
  p_status := 'failed',
  p_stage := 'extracting',
  p_error_code := 'OPENAI_UNAVAILABLE',
  p_error_message := '두 번째 실행도 실패했습니다.',
  p_error_retryable := true
);
select throws_ok(
  $$select public.begin_analysis_attempt(
    '00000000-0000-4000-8000-000000000309',
    '00000000-0000-4000-8000-000000000301',
    '00000000-0000-4000-8000-000000000317'
  )$$,
  '23514',
  'Analysis job cannot start another attempt',
  'a third workflow run is rejected'
);

select public.record_analysis_event(
  p_analysis_job_id := '00000000-0000-4000-8000-000000000309',
  p_event_id := '00000000-0000-4000-8000-000000000318',
  p_run_attempt := 1,
  p_event_type := 'progress',
  p_status := 'running',
  p_stage := 'matching'
);
select is(
  (select count(*)::integer from public.analysis_job_events where event_id = '00000000-0000-4000-8000-000000000318'),
  0,
  'a callback from an older run is acknowledged without mutation'
);

insert into public.analysis_jobs (
  id, owner_id, application_id, job_posting_id, job_posting_snapshot_id,
  resume_version_id, portfolio_version_id, job_posting_text,
  job_posting_content_hash, resume_text, resume_content_hash,
  resume_original_length, portfolio_text, portfolio_content_hash,
  portfolio_original_length, request_id
) select
  '00000000-0000-4000-8000-000000000319', owner_id,
  '00000000-0000-4000-8000-000000000307', job_posting_id,
  job_posting_snapshot_id, resume_version_id, portfolio_version_id,
  job_posting_text, job_posting_content_hash, resume_text, resume_content_hash,
  resume_original_length, portfolio_text, portfolio_content_hash,
  portfolio_original_length, '00000000-0000-4000-8000-000000000320'
from public.analysis_jobs where id = '00000000-0000-4000-8000-000000000309';
select public.begin_analysis_attempt(
  '00000000-0000-4000-8000-000000000319',
  '00000000-0000-4000-8000-000000000301',
  '00000000-0000-4000-8000-000000000321'
);
select public.cancel_analysis_job(
  '00000000-0000-4000-8000-000000000319',
  '00000000-0000-4000-8000-000000000301',
  '00000000-0000-4000-8000-000000000322'
);
select is(
  (select status::text from public.analysis_jobs where id = '00000000-0000-4000-8000-000000000319'),
  'cancelled',
  'an active run can be cancelled logically'
);

select public.record_analysis_event(
  p_analysis_job_id := '00000000-0000-4000-8000-000000000319',
  p_event_id := '00000000-0000-4000-8000-000000000323',
  p_run_attempt := 1,
  p_event_type := 'progress',
  p_status := 'running',
  p_stage := 'matching'
);
select is(
  (select status::text from public.analysis_jobs where id = '00000000-0000-4000-8000-000000000319'),
  'cancelled',
  'late callbacks cannot revive a cancelled run'
);

insert into public.analysis_jobs (
  id, owner_id, application_id, job_posting_id, job_posting_snapshot_id,
  resume_version_id, portfolio_version_id, job_posting_text,
  job_posting_content_hash, resume_text, resume_content_hash,
  resume_original_length, portfolio_text, portfolio_content_hash,
  portfolio_original_length, request_id
) select
  '00000000-0000-4000-8000-000000000324', owner_id,
  '00000000-0000-4000-8000-000000000308', job_posting_id,
  job_posting_snapshot_id, resume_version_id, portfolio_version_id,
  job_posting_text, job_posting_content_hash, resume_text, resume_content_hash,
  resume_original_length, portfolio_text, portfolio_content_hash,
  portfolio_original_length, '00000000-0000-4000-8000-000000000325'
from public.analysis_jobs where id = '00000000-0000-4000-8000-000000000309';
select public.begin_analysis_attempt(
  '00000000-0000-4000-8000-000000000324',
  '00000000-0000-4000-8000-000000000301',
  '00000000-0000-4000-8000-000000000326'
);
update public.analysis_jobs
set last_heartbeat_at = pg_catalog.now() - interval '21 minutes'
where id = '00000000-0000-4000-8000-000000000324';
select public.fail_stale_analysis_jobs(pg_catalog.now() - interval '20 minutes', 100);
select is(
  (select error_code from public.analysis_jobs where id = '00000000-0000-4000-8000-000000000324'),
  'WORKFLOW_STALLED',
  'the stale sweep marks inactive workflows as retryable failures'
);

select throws_ok(
  $$update public.analysis_job_events set message = '변경' where event_id = '00000000-0000-4000-8000-000000000311'$$,
  '23514',
  'Analysis records are immutable',
  'analysis event history is immutable'
);

select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-000000000301","role":"authenticated"}',
  true
);
set local role authenticated;
select is(
  (select count(*)::integer from public.analysis_job_events),
  10,
  'the owner can read analysis event history'
);

select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-000000000399","role":"authenticated"}',
  true
);
select is(
  (select count(*)::integer from public.analysis_job_events),
  0,
  'another user cannot read analysis event history'
);

reset role;

select * from finish();

rollback;
