begin;

set local search_path = public, extensions;

select plan(13);

select has_table('public', 'job_posting_collection_runs', 'collection runs table exists');
select has_table('public', 'job_posting_snapshots', 'immutable snapshots table exists');

select is(
  pg_catalog.has_function_privilege(
    'authenticated',
    'public.complete_job_posting_collection(uuid,uuid,uuid,public.job_posting_collection_status,public.job_posting_collection_error_code,boolean,integer,public.job_posting_snapshot_source,text,text,text,text,jsonb,timestamptz)',
    'execute'
  ),
  false,
  'authenticated cannot complete collection runs'
);

insert into auth.users (
  id, instance_id, aud, role, email, encrypted_password,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values (
  '00000000-0000-4000-8000-000000000121',
  '00000000-0000-0000-0000-000000000000',
  'authenticated', 'authenticated', 'collection-test@example.com', '',
  '{"provider":"email","providers":["email"]}', '{}',
  pg_catalog.now(), pg_catalog.now()
) on conflict (id) do nothing;

insert into public.job_postings (
  id, owner_id, source, external_id, canonical_url, company_name, title
) values (
  '00000000-0000-4000-8000-000000000122',
  '00000000-0000-4000-8000-000000000121',
  'wanted', '384409', 'https://www.wanted.co.kr/wd/384409',
  '미리디', 'AX Engineer - Infra'
);

insert into public.job_posting_collection_runs (
  id, owner_id, job_posting_id, mode, request_id
) values (
  '00000000-0000-4000-8000-000000000123',
  '00000000-0000-4000-8000-000000000121',
  '00000000-0000-4000-8000-000000000122',
  'automatic', '00000000-0000-4000-8000-000000000124'
);

select throws_ok(
  $$
    insert into public.job_posting_collection_runs (
      owner_id, job_posting_id, mode, request_id
    ) values (
      '00000000-0000-4000-8000-000000000121',
      '00000000-0000-4000-8000-000000000122',
      'automatic', '00000000-0000-4000-8000-000000000125'
    )
  $$,
  '23505',
  null,
  'only one active collection is allowed per posting'
);

select public.complete_job_posting_collection(
  '00000000-0000-4000-8000-000000000123',
  '00000000-0000-4000-8000-000000000121',
  '00000000-0000-4000-8000-000000000126',
  'succeeded', null, false, 200, 'wanted_json_ld',
  '주요 업무와 자격 요건이 포함된 충분한 길이의 공고 원문입니다.',
  '회사명: 미리디\n공고명: AX Engineer - Infra\n\n주요 업무와 자격 요건이 포함된 충분한 길이의 공고 원문입니다.',
  pg_catalog.repeat('a', 64), 'wanted-jsonld-v1',
  '{"title":"AX Engineer - Infra","companyName":"미리디","datePosted":null,"validThrough":null,"employmentType":null,"location":null,"industry":null,"occupationalCategory":null}',
  pg_catalog.now()
);

select is(
  (select status::text from public.job_posting_collection_runs where id = '00000000-0000-4000-8000-000000000123'),
  'succeeded',
  'completion makes the run terminal'
);

select is(
  (select count(*)::integer from public.job_posting_snapshots where job_posting_id = '00000000-0000-4000-8000-000000000122'),
  1,
  'successful completion stores one snapshot'
);

select lives_ok(
  $$
    select public.complete_job_posting_collection(
      '00000000-0000-4000-8000-000000000123',
      '00000000-0000-4000-8000-000000000121',
      '00000000-0000-4000-8000-000000000126',
      'succeeded'
    )
  $$,
  'the same final event is idempotent'
);

insert into public.job_posting_collection_runs (
  id, owner_id, job_posting_id, mode, request_id
) values (
  '00000000-0000-4000-8000-000000000127',
  '00000000-0000-4000-8000-000000000121',
  '00000000-0000-4000-8000-000000000122',
  'manual', '00000000-0000-4000-8000-000000000128'
);

select public.complete_job_posting_collection(
  '00000000-0000-4000-8000-000000000127',
  '00000000-0000-4000-8000-000000000121',
  '00000000-0000-4000-8000-000000000129',
  'succeeded', null, false, 200, 'manual',
  '주요 업무와 자격 요건이 포함된 충분한 길이의 공고 원문입니다.',
  '회사명: 미리디\n공고명: AX Engineer - Infra\n\n주요 업무와 자격 요건이 포함된 충분한 길이의 공고 원문입니다.',
  pg_catalog.repeat('a', 64), 'manual-v1',
  '{"title":null,"companyName":null,"datePosted":null,"validThrough":null,"employmentType":null,"location":null,"industry":null,"occupationalCategory":null}',
  pg_catalog.now()
);

select is(
  (select count(*)::integer from public.job_posting_snapshots where job_posting_id = '00000000-0000-4000-8000-000000000122'),
  1,
  'an unchanged content hash reuses the existing snapshot'
);

select throws_ok(
  $$update public.job_posting_snapshots set raw_content = 'changed' where job_posting_id = '00000000-0000-4000-8000-000000000122'$$,
  '23514',
  'Job posting snapshots are immutable',
  'snapshots cannot be updated'
);

select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-000000000121","role":"authenticated"}',
  true
);
set local role authenticated;

select is(
  (select count(*)::integer from public.job_posting_collection_runs where job_posting_id = '00000000-0000-4000-8000-000000000122'),
  2,
  'the authenticated owner can read collection history'
);

select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-000000000199","role":"authenticated"}',
  true
);

select is(
  (select count(*)::integer from public.job_posting_collection_runs where job_posting_id = '00000000-0000-4000-8000-000000000122'),
  0,
  'another user cannot read collection history'
);

select is(
  (select count(*)::integer from public.job_posting_snapshots where job_posting_id = '00000000-0000-4000-8000-000000000122'),
  0,
  'another user cannot read snapshots'
);

select throws_ok(
  $$
    insert into public.job_posting_collection_runs (
      owner_id, job_posting_id, mode, request_id
    ) values (
      '00000000-0000-4000-8000-000000000121',
      '00000000-0000-4000-8000-000000000122',
      'automatic', '00000000-0000-4000-8000-000000000130'
    )
  $$,
  '42501',
  null,
  'authenticated clients cannot create collection runs directly'
);

select * from finish();

rollback;
