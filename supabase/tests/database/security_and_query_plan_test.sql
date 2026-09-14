begin;

set local search_path = public, extensions;
set local enable_seqscan = off;

select plan(12);

select is_empty(
  $$
    select namespace.nspname || '.' || relation.relname
      from pg_catalog.pg_class as relation
      join pg_catalog.pg_namespace as namespace on namespace.oid = relation.relnamespace
     where namespace.nspname = 'public'
       and relation.relkind in ('r', 'p')
       and not relation.relrowsecurity
       and not exists (
         select 1
           from pg_catalog.pg_depend as dependency
          where dependency.classid = 'pg_class'::regclass
            and dependency.objid = relation.oid
            and dependency.deptype = 'e'
       )
  $$,
  'all application tables in public enable RLS'
);

select is_empty(
  $$
    select table_schema || '.' || table_name || ':' || privilege_type
      from information_schema.role_table_grants
     where table_schema = 'public'
       and grantee = 'anon'
       and privilege_type in ('INSERT', 'UPDATE', 'DELETE', 'TRUNCATE')
  $$,
  'anon has no write privilege on public tables'
);

select is_empty(
  $$
    select table_schema || '.' || table_name || ':' || privilege_type
      from information_schema.role_table_grants
     where table_schema = 'public'
       and grantee = 'authenticated'
       and privilege_type in ('INSERT', 'UPDATE', 'DELETE', 'TRUNCATE')
  $$,
  'authenticated users cannot bypass Worker writes'
);

select is_empty(
  $$
    select namespace.nspname || '.' || procedure.proname
      from pg_catalog.pg_proc as procedure
      join pg_catalog.pg_namespace as namespace on namespace.oid = procedure.pronamespace
     where namespace.nspname in ('public', 'private')
       and procedure.prosecdef
       and not ('search_path=""' = any(coalesce(procedure.proconfig, '{}'::text[])))
  $$,
  'security definer functions use an empty search_path'
);

select is_empty(
  $$
    select procedure.oid::regprocedure::text
      from pg_catalog.pg_proc as procedure
      join pg_catalog.pg_namespace as namespace on namespace.oid = procedure.pronamespace
     where namespace.nspname = 'public'
       and procedure.prosecdef
       and pg_catalog.has_function_privilege('authenticated', procedure.oid, 'execute')
  $$,
  'authenticated cannot execute service write RPCs'
);

select is_empty(
  $$
    select procedure.oid::regprocedure::text
      from pg_catalog.pg_proc as procedure
      join pg_catalog.pg_namespace as namespace on namespace.oid = procedure.pronamespace
     where namespace.nspname = 'public'
       and procedure.prosecdef
       and not pg_catalog.has_function_privilege('service_role', procedure.oid, 'execute')
  $$,
  'service_role can execute service write RPCs'
);

create function pg_temp.query_plan(statement text)
returns text
language plpgsql
as $$
declare result json;
begin
  execute 'explain (format json, costs off) ' || statement into result;
  return result::text;
end;
$$;

select matches(
  pg_temp.query_plan($$select * from public.applications
    where owner_id = '00000000-0000-4000-8000-000000000001' and archived_at is null
    order by updated_at desc, id desc limit 20$$),
  'applications_owner_active_updated_idx',
  'active application listing uses its owner index'
);

select matches(
  pg_temp.query_plan($$select * from public.analysis_jobs
    where owner_id = '00000000-0000-4000-8000-000000000001'
      and application_id = '00000000-0000-4000-8000-000000000002'
    order by created_at desc, id desc limit 20$$),
  'analysis_jobs_application_created_idx',
  'analysis history uses its application index'
);

select matches(
  pg_temp.query_plan($$select * from public.document_versions
    where owner_id = '00000000-0000-4000-8000-000000000001' and document_type = 'resume'
    order by created_at desc limit 20$$),
  'document_versions_owner_type_created_idx',
  'document listing uses its owner and type index'
);

select matches(
  pg_temp.query_plan($$select * from public.job_posting_collection_runs
    where owner_id = '00000000-0000-4000-8000-000000000001'
      and job_posting_id = '00000000-0000-4000-8000-000000000002'
    order by created_at desc, id desc limit 20$$),
  'job_posting_collection_runs_posting_created_idx',
  'collection history uses its posting index'
);

select matches(
  pg_temp.query_plan($$select id from public.analysis_jobs
    where status in ('queued', 'running', 'retrying')
      and last_heartbeat_at < '2026-09-15T00:00:00Z'::timestamptz limit 100$$),
  'analysis_jobs_stale_idx',
  'stale analysis sweep uses its partial index'
);

select matches(
  pg_temp.query_plan($$select id from public.slack_notifications
    where status = 'queued' and route_key = 'job_channel'
    order by not_before, created_at, id limit 1$$),
  'slack_notifications_queue_idx',
  'Slack outbox claim uses its queue index'
);

select * from finish();

rollback;
