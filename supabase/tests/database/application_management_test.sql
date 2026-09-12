begin;

set local search_path = public, extensions;

select plan(16);

select has_table('public', 'job_postings', 'job_postings table exists');
select has_table('public', 'applications', 'applications table exists');
select has_table(
  'public',
  'application_documents',
  'application_documents table exists'
);
select has_table(
  'public',
  'application_status_history',
  'application_status_history table exists'
);

select is(
  pg_catalog.has_function_privilege(
    'authenticated',
    'public.create_application_with_posting(uuid,public.job_posting_source,text,text,text,text,public.application_status,date,timestamptz,text,uuid,uuid)',
    'execute'
  ),
  false,
  'authenticated cannot call the service write function'
);

insert into auth.users (
  id,
  instance_id,
  aud,
  role,
  email,
  encrypted_password,
  raw_app_meta_data,
  raw_user_meta_data,
  created_at,
  updated_at
) values (
  '00000000-0000-4000-8000-000000000081',
  '00000000-0000-0000-0000-000000000000',
  'authenticated',
  'authenticated',
  'application-management@example.com',
  '',
  '{"provider":"email","providers":["email"]}',
  '{}',
  pg_catalog.now(),
  pg_catalog.now()
) on conflict (id) do nothing;

insert into public.document_versions (
  id,
  owner_id,
  document_type,
  label,
  original_filename,
  storage_path,
  mime_type,
  file_size,
  content_hash
) values
  (
    '00000000-0000-4000-8000-000000000082',
    '00000000-0000-4000-8000-000000000081',
    'resume',
    'Application resume',
    'resume.pdf',
    '00000000-0000-4000-8000-000000000081/resume/00000000-0000-4000-8000-000000000082.pdf',
    'application/pdf',
    1,
    pg_catalog.repeat('a', 64)
  ),
  (
    '00000000-0000-4000-8000-000000000083',
    '00000000-0000-4000-8000-000000000081',
    'portfolio',
    'Application portfolio',
    'portfolio.pdf',
    '00000000-0000-4000-8000-000000000081/portfolio/00000000-0000-4000-8000-000000000083.pdf',
    'application/pdf',
    1,
    pg_catalog.repeat('b', 64)
  );

create temporary table application_test_context (
  application_id uuid not null,
  job_posting_id uuid not null
) on commit drop;

insert into application_test_context (application_id, job_posting_id)
select created.id, created.job_posting_id
  from public.create_application_with_posting(
    '00000000-0000-4000-8000-000000000081',
    'wanted',
    '384409',
    'https://www.wanted.co.kr/wd/384409',
    '미리디',
    'AX Engineer - Infra',
    'interested',
    null,
    null,
    null,
    null,
    null
  ) as created;

select is(
  (select attempt_number from public.applications where id = (select application_id from application_test_context)),
  1,
  'the first application uses attempt number one'
);

select is(
  (select count(*)::integer from public.application_status_history where application_id = (select application_id from application_test_context)),
  1,
  'application creation records the initial status history'
);

select throws_ok(
  $$
    select public.create_application_with_posting(
      '00000000-0000-4000-8000-000000000081',
      'wanted',
      '384409',
      'https://www.wanted.co.kr/wd/384409',
      '미리디',
      'Duplicate',
      'interested',
      null,
      null,
      null,
      null,
      null
    )
  $$,
  '23505',
  null,
  'the same Wanted posting cannot be created twice'
);

select throws_ok(
  format(
    $$select public.replace_application_state(
      '00000000-0000-4000-8000-000000000081', %L, 'applied',
      current_date, null, null, null, null, false
    )$$,
    (select application_id from application_test_context)
  ),
  '23514',
  'Submitted applications require resume and portfolio versions',
  'submitted applications require both documents'
);

select public.replace_application_state(
  '00000000-0000-4000-8000-000000000081',
  (select application_id from application_test_context),
  'applied',
  current_date,
  null,
  null,
  '00000000-0000-4000-8000-000000000082',
  '00000000-0000-4000-8000-000000000083',
  false
);

select isnt(
  (select documents_locked_at from public.applications where id = (select application_id from application_test_context)),
  null,
  'submitted application documents are locked'
);

select throws_ok(
  format(
    'delete from public.application_documents where application_id = %L',
    (select application_id from application_test_context)
  ),
  '23514',
  'Submitted application documents cannot be changed',
  'locked selections cannot be deleted'
);

select is(
  (
    select created.attempt_number
      from public.create_application_attempt(
        '00000000-0000-4000-8000-000000000081',
        (select job_posting_id from application_test_context),
        'interested',
        null,
        null,
        null,
        null,
        null
      ) as created
  ),
  2,
  'reapplication creates the next attempt'
);

select public.replace_application_state(
  '00000000-0000-4000-8000-000000000081',
  (select application_id from application_test_context),
  'applied',
  current_date,
  null,
  null,
  '00000000-0000-4000-8000-000000000082',
  '00000000-0000-4000-8000-000000000083',
  true
);

select is(
  (select status::text from public.applications where id = (select application_id from application_test_context)),
  'applied',
  'archive does not change the business status'
);

select isnt(
  (select archived_at from public.applications where id = (select application_id from application_test_context)),
  null,
  'archive is stored separately'
);

select is(
  (select count(*)::integer from public.application_status_history where application_id = (select application_id from application_test_context)),
  2,
  'status changes append history without archive noise'
);

select ok(
  (
    select created.documents_locked_at is not null
      from public.create_application_with_posting(
        '00000000-0000-4000-8000-000000000081',
        'wanted',
        '384410',
        'https://www.wanted.co.kr/wd/384410',
        '테스트 회사',
        'Submitted from creation',
        'applied',
        current_date,
        null,
        null,
        '00000000-0000-4000-8000-000000000082',
        '00000000-0000-4000-8000-000000000083'
      ) as created
  ),
  'an application can start in a submitted state with locked documents'
);

select * from finish();

rollback;
