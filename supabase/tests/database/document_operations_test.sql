begin;

select plan(8);

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
  '00000000-0000-4000-8000-000000000071',
  '00000000-0000-0000-0000-000000000000',
  'authenticated',
  'authenticated',
  'document-operations@example.com',
  '',
  '{"provider":"email","providers":["email"]}',
  '{}',
  pg_catalog.now(),
  pg_catalog.now()
) on conflict (id) do nothing;

select has_function(
  'public',
  'register_document_version',
  'register_document_version function exists'
);

select has_function(
  'public',
  'set_default_document_version',
  'set_default_document_version function exists'
);

select is(
  pg_catalog.has_function_privilege(
    'authenticated',
    'public.register_document_version(uuid,uuid,public.document_type,text,text,text,text,bigint,text)',
    'execute'
  ),
  false,
  'authenticated cannot register a document through the service function'
);

select is(
  (
    select registered.is_default
      from public.register_document_version(
        '00000000-0000-4000-8000-000000000072',
        '00000000-0000-4000-8000-000000000071',
        'resume',
        'First resume',
        'first.pdf',
        '00000000-0000-4000-8000-000000000071/resume/00000000-0000-4000-8000-000000000072.pdf',
        'application/pdf',
        5,
        pg_catalog.repeat('a', 64)
      ) as registered
  ),
  true,
  'the first active version becomes the default'
);

select is(
  (
    select registered.is_default
      from public.register_document_version(
        '00000000-0000-4000-8000-000000000073',
        '00000000-0000-4000-8000-000000000071',
        'resume',
        'Second resume',
        'second.pdf',
        '00000000-0000-4000-8000-000000000071/resume/00000000-0000-4000-8000-000000000073.pdf',
        'application/pdf',
        5,
        pg_catalog.repeat('b', 64)
      ) as registered
  ),
  false,
  'later versions are not selected automatically'
);

select is(
  (
    select selected.is_default
      from public.set_default_document_version(
        '00000000-0000-4000-8000-000000000071',
        'resume',
        '00000000-0000-4000-8000-000000000073'
      ) as selected
  ),
  true,
  'an active version can become the default'
);

select is(
  (
    select is_default
      from public.document_versions
     where id = '00000000-0000-4000-8000-000000000072'
  ),
  false,
  'the previous default is cleared atomically'
);

update public.document_versions
   set archived_at = pg_catalog.now()
 where id = '00000000-0000-4000-8000-000000000072';

select throws_ok(
  $$
    select public.set_default_document_version(
      '00000000-0000-4000-8000-000000000071',
      'resume',
      '00000000-0000-4000-8000-000000000072'
    )
  $$,
  'P0002',
  'An active document version was not found',
  'an archived version cannot become the default'
);

select * from finish();

rollback;
