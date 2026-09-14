begin;

set local search_path = public, extensions;

select plan(26);

select has_table('public', 'analysis_reviews', 'analysis reviews table exists');
select has_table('public', 'analysis_requirement_reviews', 'requirement reviews table exists');
select has_table('public', 'interview_questions', 'interview questions table exists');
select has_table('public', 'interview_answers', 'interview answer revisions table exists');
select has_table('public', 'interview_checklist_items', 'interview checklist table exists');
select has_table('public', 'interview_notes', 'interview notes table exists');

select is(
  pg_catalog.has_function_privilege(
    'authenticated',
    'public.save_analysis_review(uuid,uuid,timestamptz,text,jsonb)',
    'execute'
  ),
  false,
  'authenticated clients cannot save reviews directly'
);
select is(
  pg_catalog.has_function_privilege(
    'authenticated',
    'public.save_interview_answer(uuid,uuid,text)',
    'execute'
  ),
  false,
  'authenticated clients cannot save answers directly'
);
select is(
  pg_catalog.has_function_privilege(
    'authenticated',
    'public.reorder_interview_checklist(uuid,uuid,uuid[])',
    'execute'
  ),
  false,
  'authenticated clients cannot reorder checklists directly'
);

insert into auth.users (
  id, instance_id, aud, role, email, encrypted_password,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values (
  '00000000-0000-4000-8000-000000000401',
  '00000000-0000-0000-0000-000000000000',
  'authenticated', 'authenticated', 'analysis-workspace@example.com', '',
  '{"provider":"email","providers":["email"]}', '{}',
  pg_catalog.now(), pg_catalog.now()
);

insert into public.document_versions (
  id, owner_id, document_type, label, original_filename, storage_path,
  mime_type, file_size, content_hash, extracted_text, extraction_status
) values
  (
    '00000000-0000-4000-8000-000000000402',
    '00000000-0000-4000-8000-000000000401', 'resume', '이력서',
    'resume.pdf',
    '00000000-0000-4000-8000-000000000401/resume/00000000-0000-4000-8000-000000000402.pdf',
    'application/pdf', 100, pg_catalog.repeat('a', 64), 'Worker API 구현 경험', 'ready'
  ),
  (
    '00000000-0000-4000-8000-000000000403',
    '00000000-0000-4000-8000-000000000401', 'portfolio', '포트폴리오',
    'portfolio.pdf',
    '00000000-0000-4000-8000-000000000401/portfolio/00000000-0000-4000-8000-000000000403.pdf',
    'application/pdf', 100, pg_catalog.repeat('b', 64), 'n8n 자동화 경험', 'ready'
  );

insert into public.job_postings (
  id, owner_id, source, external_id, canonical_url, company_name, title
) values (
  '00000000-0000-4000-8000-000000000404',
  '00000000-0000-4000-8000-000000000401', 'wanted', '384409',
  'https://www.wanted.co.kr/wd/384409', '미리디', 'AX Engineer - Infra'
);

insert into public.job_posting_snapshots (
  id, owner_id, job_posting_id, source, raw_content, normalized_content,
  content_hash, parser_version, source_metadata, fetched_at
) values (
  '00000000-0000-4000-8000-000000000405',
  '00000000-0000-4000-8000-000000000401',
  '00000000-0000-4000-8000-000000000404', 'manual',
  'Cloudflare Worker 운영 경험', 'Cloudflare Worker 운영 경험',
  pg_catalog.repeat('c', 64), 'manual-v1', '{}', pg_catalog.now()
);

insert into public.applications (
  id, owner_id, job_posting_id, attempt_number, status
) values (
  '00000000-0000-4000-8000-000000000406',
  '00000000-0000-4000-8000-000000000401',
  '00000000-0000-4000-8000-000000000404', 1, 'interview'
);

insert into public.application_documents (
  application_id, owner_id, document_type, document_version_id
) values
  (
    '00000000-0000-4000-8000-000000000406',
    '00000000-0000-4000-8000-000000000401', 'resume',
    '00000000-0000-4000-8000-000000000402'
  ),
  (
    '00000000-0000-4000-8000-000000000406',
    '00000000-0000-4000-8000-000000000401', 'portfolio',
    '00000000-0000-4000-8000-000000000403'
  );

insert into public.analysis_jobs (
  id, owner_id, application_id, job_posting_id, job_posting_snapshot_id,
  resume_version_id, portfolio_version_id, job_posting_text,
  job_posting_content_hash, resume_text, resume_content_hash,
  resume_original_length, portfolio_text, portfolio_content_hash,
  portfolio_original_length, request_id, status, stage, attempt_count,
  final_event_id, started_at, finished_at
) values (
  '00000000-0000-4000-8000-000000000407',
  '00000000-0000-4000-8000-000000000401',
  '00000000-0000-4000-8000-000000000406',
  '00000000-0000-4000-8000-000000000404',
  '00000000-0000-4000-8000-000000000405',
  '00000000-0000-4000-8000-000000000402',
  '00000000-0000-4000-8000-000000000403',
  'Cloudflare Worker 운영 경험', pg_catalog.repeat('c', 64),
  'Worker API 구현 경험', pg_catalog.repeat('d', 64), 16,
  'n8n 자동화 경험', pg_catalog.repeat('e', 64), 10,
  '00000000-0000-4000-8000-000000000408',
  'succeeded', 'saving', 1,
  '00000000-0000-4000-8000-000000000409',
  pg_catalog.now(), pg_catalog.now()
);

insert into public.analysis_results (
  analysis_job_id, owner_id, schema_version, job_posting_facts,
  result, completed_event_id
) values (
  '00000000-0000-4000-8000-000000000407',
  '00000000-0000-4000-8000-000000000401',
  '1.0.0',
  '{"title":"AX Engineer - Infra"}',
  '{
    "job": {
      "title": "AX Engineer - Infra",
      "companyName": "미리디",
      "summary": "자동화 역량을 요구합니다.",
      "requirements": [
        {"id":"required-1","kind":"required","text":"Worker 운영","evidence":[]},
        {"id":"preferred-1","kind":"preferred","text":"n8n 경험","evidence":[]}
      ],
      "technologies": [], "traits": [], "warnings": []
    },
    "comparison": {
      "summary": "일부 경험이 확인됩니다.",
      "matches": [
        {"requirementId":"required-1","status":"partial","rationale":"보완 필요","profileEvidence":[]},
        {"requirementId":"preferred-1","status":"matched","rationale":"경험 있음","profileEvidence":[]}
      ],
      "gaps": [
        {
          "title":"운영 경험", "description":"장애 대응을 보완합니다.",
          "priority":"high", "requirementIds":["required-1"], "evidence":[],
          "actions":["장애 시나리오 정리", "모니터링 지표 정리"]
        }
      ],
      "interviewQuestions": [
        {
          "category":"인프라", "question":"장애 대응 경험을 설명해 주세요.",
          "intent":"문제 해결 과정 확인", "priority":"high",
          "requirementIds":["required-1"]
        }
      ],
      "warnings": []
    },
    "fitScore": 65
  }',
  '00000000-0000-4000-8000-000000000409'
);

select is(
  (select count(*)::integer from public.interview_questions where analysis_job_id = '00000000-0000-4000-8000-000000000407'),
  1,
  'analysis result insertion seeds interview questions'
);
select is(
  (select count(*)::integer from public.interview_checklist_items where analysis_job_id = '00000000-0000-4000-8000-000000000407'),
  2,
  'analysis result insertion seeds every gap action'
);
select throws_ok(
  $$update public.interview_questions set question = '변경' where analysis_job_id = '00000000-0000-4000-8000-000000000407'$$,
  '23514',
  'Analysis records are immutable',
  'generated questions are immutable'
);

select public.save_interview_answer(
  (select id from public.interview_questions where analysis_job_id = '00000000-0000-4000-8000-000000000407'),
  '00000000-0000-4000-8000-000000000401',
  '첫 번째 답변'
);
select is(
  (select max(revision) from public.interview_answers),
  1,
  'the first explicit answer save creates revision one'
);
select public.save_interview_answer(
  (select id from public.interview_questions where analysis_job_id = '00000000-0000-4000-8000-000000000407'),
  '00000000-0000-4000-8000-000000000401',
  '첫 번째 답변'
);
select is(
  (select count(*)::integer from public.interview_answers),
  1,
  'saving identical answer content is a no-op'
);
select public.save_interview_answer(
  (select id from public.interview_questions where analysis_job_id = '00000000-0000-4000-8000-000000000407'),
  '00000000-0000-4000-8000-000000000401',
  '수정한 답변'
);
select is(
  (select max(revision) from public.interview_answers),
  2,
  'changed answer content creates the next revision'
);
select public.save_interview_answer(
  (select id from public.interview_questions where analysis_job_id = '00000000-0000-4000-8000-000000000407'),
  '00000000-0000-4000-8000-000000000401',
  null
);
select is(
  (select max(revision) from public.interview_answers),
  3,
  'clearing the current answer is recorded as a null revision'
);

select public.save_analysis_review(
  '00000000-0000-4000-8000-000000000407',
  '00000000-0000-4000-8000-000000000401',
  null,
  '장애 대응 사례를 보완한다.',
  '[{"requirementId":"required-1","overrideStatus":"matched","note":"개인 프로젝트 근거 추가"}]'
);
select is(
  (select overall_note from public.analysis_reviews where analysis_job_id = '00000000-0000-4000-8000-000000000407'),
  '장애 대응 사례를 보완한다.',
  'analysis review saves an overall note'
);
select is(
  (select count(*)::integer from public.analysis_requirement_reviews where analysis_job_id = '00000000-0000-4000-8000-000000000407'),
  1,
  'analysis review replaces requirement overrides atomically'
);
select throws_ok(
  $$select public.save_analysis_review(
    '00000000-0000-4000-8000-000000000407',
    '00000000-0000-4000-8000-000000000401',
    (select updated_at from public.analysis_reviews where analysis_job_id = '00000000-0000-4000-8000-000000000407'),
    null,
    '[{"requirementId":"unknown","overrideStatus":"matched","note":null}]'
  )$$,
  '23514',
  'Unknown requirement review',
  'unknown requirement overrides are rejected'
);
select throws_ok(
  $$select public.save_analysis_review(
    '00000000-0000-4000-8000-000000000407',
    '00000000-0000-4000-8000-000000000401',
    '2020-01-01T00:00:00Z',
    null,
    '[]'
  )$$,
  '40001',
  'Analysis review was updated elsewhere',
  'stale review updates are rejected'
);

select public.reorder_interview_checklist(
  '00000000-0000-4000-8000-000000000407',
  '00000000-0000-4000-8000-000000000401',
  array(
    select id from public.interview_checklist_items
     where analysis_job_id = '00000000-0000-4000-8000-000000000407'
     order by position desc
  )
);
select is(
  (select source_key from public.interview_checklist_items where position = 0),
  'gap:0:action:1',
  'checklist reorder persists the complete requested order'
);
select throws_ok(
  $$select public.reorder_interview_checklist(
    '00000000-0000-4000-8000-000000000407',
    '00000000-0000-4000-8000-000000000401',
    array[(select id from public.interview_checklist_items limit 1)]
  )$$,
  '23514',
  'Checklist order must include every active item',
  'partial checklist orders are rejected'
);

insert into public.interview_notes (
  application_id, analysis_job_id, owner_id, round_label, interviewed_at,
  questions_asked, went_well
) values (
  '00000000-0000-4000-8000-000000000406',
  '00000000-0000-4000-8000-000000000407',
  '00000000-0000-4000-8000-000000000401',
  '1차 실무 면접', pg_catalog.now(), '장애 대응 질문', '근거를 설명했다.'
);
select is(
  (select round_label from public.interview_notes where application_id = '00000000-0000-4000-8000-000000000406'),
  '1차 실무 면접',
  'structured interview notes are stored'
);
select throws_ok(
  $$insert into public.interview_notes (
    application_id, analysis_job_id, owner_id, round_label, interviewed_at
  ) values (
    '00000000-0000-4000-8000-000000000406',
    '00000000-0000-4000-8000-000000000407',
    '00000000-0000-4000-8000-000000000401',
    '빈 회고', pg_catalog.now()
  )$$,
  '23514',
  null,
  'an interview note requires at least one content field'
);

select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-000000000401","role":"authenticated"}',
  true
);
set local role authenticated;
select is(
  (select count(*)::integer from public.interview_questions),
  1,
  'the owner can read generated interview questions'
);
select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-000000000499","role":"authenticated"}',
  true
);
select is(
  (select count(*)::integer from public.interview_questions),
  0,
  'another user cannot read interview workspace data'
);

reset role;

select * from finish();

rollback;
