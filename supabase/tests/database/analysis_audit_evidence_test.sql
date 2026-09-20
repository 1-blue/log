begin;

set local search_path = public, extensions;

select plan(9);

select has_table(
  'public',
  'document_evidence_reviews',
  'document evidence review table exists'
);

select has_column(
  'public',
  'analysis_jobs',
  'input_audit',
  'analysis jobs preserve the dispatch input audit'
);

select is(
  pg_catalog.has_table_privilege('anon', 'public.document_evidence_reviews', 'INSERT'),
  false,
  'anon cannot insert evidence reviews'
);

select is(
  pg_catalog.has_table_privilege('authenticated', 'public.document_evidence_reviews', 'UPDATE'),
  false,
  'authenticated cannot update evidence reviews directly'
);

select is(
  pg_catalog.has_table_privilege('service_role', 'public.document_evidence_reviews', 'INSERT'),
  true,
  'service_role can insert evidence reviews through Worker'
);

select is(
  pg_catalog.has_table_privilege('service_role', 'public.document_evidence_reviews', 'UPDATE'),
  true,
  'service_role can update evidence reviews through Worker'
);

select is_empty(
  $$
    select policyname
      from pg_catalog.pg_policies
     where schemaname = 'public'
       and tablename = 'document_evidence_reviews'
       and (cmd <> 'SELECT' or roles <> array['authenticated']::name[])
  $$,
  'evidence reviews expose only owner reads to authenticated users'
);

select matches(
  (
    select pg_get_constraintdef(oid)
      from pg_catalog.pg_constraint
     where conname = 'document_evidence_reviews_unique_key'
       and conrelid = 'public.document_evidence_reviews'::regclass
  ),
  'UNIQUE.*owner_id.*profile_id.*evidence_key',
  'evidence review records are idempotent per profile and evidence key'
);

select is(
  pg_catalog.has_schema_privilege('service_role', 'private', 'USAGE'),
  true,
  'service role can resolve private trigger helpers'
);

select * from finish();

rollback;
