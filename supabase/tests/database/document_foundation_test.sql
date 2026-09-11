begin;

select plan(18);

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
  3,
  'document_versions has select, insert, and update policies'
);

select is(
  (
    select count(*)::integer
      from pg_catalog.pg_policies
     where schemaname = 'public'
       and tablename = 'document_publications'
  ),
  4,
  'document_publications has select, insert, update, and delete policies'
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
  2,
  'career-documents has only own select and insert policies'
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

create temporary table document_foundation_test_context (
  owner_id uuid not null,
  document_id uuid not null
) on commit drop;

insert into document_foundation_test_context (owner_id, document_id)
select id, extensions.gen_random_uuid()
  from auth.users
 order by created_at
 limit 1;

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

select throws_ok(
  $$
    insert into public.document_versions (
      owner_id,
      document_type,
      label,
      original_filename,
      storage_path,
      mime_type,
      file_size,
      content_hash
    ) values (
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
