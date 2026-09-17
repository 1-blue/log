begin;

select plan(19);

select has_table(
  'public',
  'document_versions',
  'document_versions table exists'
);

select has_table(
  'public',
  'document_publications',
  'document_publications table exists'
);

select has_column(
  'public',
  'document_versions',
  'content_hash',
  'document_versions stores content hashes'
);

select has_column(
  'public',
  'document_versions',
  'extraction_status',
  'document_versions stores extraction status'
);

select is(
  (
    select relrowsecurity
      from pg_catalog.pg_class
     where oid = 'public.document_versions'::regclass
  ),
  true,
  'document_versions has RLS enabled'
);

select is(
  (
    select relforcerowsecurity
      from pg_catalog.pg_class
     where oid = 'public.document_versions'::regclass
  ),
  true,
  'document_versions forces RLS'
);

select is(
  (
    select relrowsecurity
      from pg_catalog.pg_class
     where oid = 'public.document_publications'::regclass
  ),
  true,
  'document_publications has RLS enabled'
);

select is(
  (
    select count(*)::integer
      from pg_catalog.pg_policies
     where schemaname = 'public'
       and tablename = 'document_versions'
  ),
  1,
  'document_versions exposes only its owner select policy'
);

select is(
  (
    select count(*)::integer
      from pg_catalog.pg_policies
     where schemaname = 'public'
       and tablename = 'document_publications'
  ),
  1,
  'document_publications exposes only its owner select policy'
);

select is(
  (
    select public
      from storage.buckets
     where id = 'career-documents'
  ),
  false,
  'career-documents is private'
);

select is(
  (
    select file_size_limit
      from storage.buckets
     where id = 'career-documents'
  ),
  20971520::bigint,
  'career-documents is limited to 20 MiB'
);

select is(
  (
    select allowed_mime_types
      from storage.buckets
     where id = 'career-documents'
  ),
  array['application/pdf']::text[],
  'career-documents only accepts PDF files'
);

select is(
  (
    select count(*)::integer
      from pg_catalog.pg_policies
     where schemaname = 'storage'
       and tablename = 'objects'
       and policyname like 'career_documents_%'
  ),
  3,
  'career-documents has only own select, insert, and delete policies'
);

select is(
  (
    select count(*)::integer
      from information_schema.role_table_grants
     where table_schema = 'public'
       and table_name = 'document_versions'
       and grantee = 'anon'
  ),
  0,
  'anon has no document_versions grants'
);

select is(
  (
    select count(*)::integer
      from information_schema.role_table_grants
     where table_schema = 'public'
       and table_name = 'document_publications'
       and grantee = 'anon'
  ),
  0,
  'anon has no document_publications grants'
);

insert into auth.users (
  id, instance_id, aud, role, email, encrypted_password,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values (
  '00000000-0000-4000-8000-000000000091',
  '00000000-0000-0000-0000-000000000000',
  'authenticated', 'authenticated', 'document-foundation@example.com', '',
  '{"provider":"email","providers":["email"]}', '{}',
  pg_catalog.now(), pg_catalog.now()
), (
  '00000000-0000-4000-8000-000000000099',
  '00000000-0000-0000-0000-000000000000',
  'authenticated', 'authenticated', 'another-document-owner@example.com', '',
  '{"provider":"email","providers":["email"]}', '{}',
  pg_catalog.now(), pg_catalog.now()
);

create temporary table document_foundation_test_context (
  owner_id uuid not null,
  document_id uuid not null
) on commit drop;

insert into document_foundation_test_context (owner_id, document_id)
values (
  '00000000-0000-4000-8000-000000000091',
  '00000000-0000-4000-8000-000000000092'
);

grant select on document_foundation_test_context to authenticated;

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
)
select
  document_id,
  owner_id,
  'resume'::public.document_type,
  'RLS test',
  'rls-test.pdf',
  owner_id::text || '/resume/' || document_id::text || '.pdf',
  'application/pdf',
  1,
  pg_catalog.repeat('0', 64)
from document_foundation_test_context;

select lives_ok(
  $$
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
    ) values (
      '00000000-0000-4000-8000-000000000093',
      '00000000-0000-4000-8000-000000000091',
      'portfolio',
      'Named storage path',
      'portfolio.pdf',
  '00000000-0000-4000-8000-000000000091/portfolio/2026-portfolio-000000.pdf',
      'application/pdf',
      1,
      pg_catalog.repeat('1', 64)
    )
  $$,
  'document_versions accepts the ASCII-safe named storage path'
);

select set_config(
  'request.jwt.claims',
  pg_catalog.json_build_object(
    'sub', (select owner_id::text from document_foundation_test_context),
    'role', 'authenticated'
  )::text,
  true
);

set local role authenticated;

select is(
  (
    select count(*)::integer
      from public.document_versions
     where id = (select document_id from document_foundation_test_context)
  ),
  1,
  'authenticated owner can read their document version'
);

select set_config(
  'request.jwt.claims',
  pg_catalog.json_build_object(
    'sub', '00000000-0000-4000-8000-000000000099',
    'role', 'authenticated'
  )::text,
  true
);

select is(
  (
    select count(*)::integer
      from public.document_versions
     where id = (select document_id from document_foundation_test_context)
  ),
  0,
  'authenticated users cannot read another owner document version'
);

select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-000000000091","role":"authenticated"}',
  true
);

select throws_ok(
  $$
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
    ) values (
      '00000000-0000-4000-8000-000000000098',
      '00000000-0000-4000-8000-000000000099',
      'resume',
      'RLS test denied',
      'rls-test-denied.pdf',
      '00000000-0000-4000-8000-000000000099/resume/00000000-0000-4000-8000-000000000098.pdf',
      'application/pdf',
      1,
      pg_catalog.repeat('1', 64)
    )
  $$,
  '42501',
  null,
  'authenticated users cannot insert for another owner'
);

select * from finish();

rollback;
