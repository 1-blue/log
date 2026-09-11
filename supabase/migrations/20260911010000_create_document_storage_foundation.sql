create extension if not exists "pgcrypto" with schema extensions;

create type public.document_type as enum ('resume', 'portfolio');

create type public.document_extraction_status as enum (
  'pending',
  'processing',
  'ready',
  'failed'
);

create schema if not exists private;

revoke all on schema private from public;

create or replace function private.set_updated_at()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.updated_at = pg_catalog.now();
  return new;
end;
$$;

create table public.document_versions (
  id uuid primary key default extensions.gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete restrict,
  document_type public.document_type not null,
  label text not null
    constraint document_versions_label_length
      check (pg_catalog.char_length(pg_catalog.btrim(label)) between 1 and 100),
  original_filename text not null
    constraint document_versions_filename_length
      check (pg_catalog.char_length(pg_catalog.btrim(original_filename)) between 1 and 255),
  storage_path text not null unique,
  mime_type text not null
    constraint document_versions_mime_type_check
      check (mime_type = 'application/pdf'),
  file_size bigint not null
    constraint document_versions_file_size_check
      check (file_size between 1 and 20971520),
  content_hash text not null
    constraint document_versions_content_hash_check
      check (content_hash ~ '^[0-9a-f]{64}$'),
  extracted_text text,
  extraction_status public.document_extraction_status not null default 'pending',
  extraction_error text,
  is_default boolean not null default false,
  archived_at timestamptz,
  created_at timestamptz not null default pg_catalog.now(),
  updated_at timestamptz not null default pg_catalog.now(),
  constraint document_versions_storage_path_check
    check (
      storage_path = pg_catalog.format(
        '%s/%s/%s.pdf',
        owner_id,
        document_type,
        id
      )
    ),
  constraint document_versions_default_archive_check
    check (not is_default or archived_at is null),
  constraint document_versions_id_owner_type_key
    unique (id, owner_id, document_type)
);

create index document_versions_owner_type_created_idx
  on public.document_versions (owner_id, document_type, created_at desc);

create index document_versions_owner_hash_idx
  on public.document_versions (owner_id, content_hash);

create unique index document_versions_one_default_idx
  on public.document_versions (owner_id, document_type)
  where is_default and archived_at is null;

create table public.document_publications (
  owner_id uuid not null references auth.users(id) on delete restrict,
  document_type public.document_type not null,
  document_version_id uuid not null,
  published_at timestamptz not null default pg_catalog.now(),
  updated_at timestamptz not null default pg_catalog.now(),
  primary key (owner_id, document_type),
  constraint document_publications_version_fk
    foreign key (document_version_id, owner_id, document_type)
    references public.document_versions (id, owner_id, document_type)
    on delete restrict
);

create index document_publications_version_idx
  on public.document_publications (document_version_id);

create or replace function private.validate_document_publication()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  version_archived_at timestamptz;
begin
  select document_version.archived_at
    into version_archived_at
    from public.document_versions as document_version
   where document_version.id = new.document_version_id
     and document_version.owner_id = new.owner_id
     and document_version.document_type = new.document_type;

  if not found then
    raise exception using
      errcode = '23503',
      message = 'The published document version does not match the owner and type';
  end if;

  if version_archived_at is not null then
    raise exception using
      errcode = '23514',
      message = 'An archived document version cannot be published';
  end if;

  return new;
end;
$$;

create or replace function private.validate_document_version_lifecycle()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.archived_at is not null and old.archived_at is null then
    if exists (
      select 1
        from public.document_publications as publication
       where publication.owner_id = new.owner_id
         and publication.document_version_id = new.id
    ) then
      raise exception using
        errcode = '23514',
        message = 'A published document version must be unpublished before archiving';
    end if;
  end if;

  return new;
end;
$$;

create trigger document_versions_set_updated_at
  before update on public.document_versions
  for each row execute function private.set_updated_at();

create trigger document_versions_validate_lifecycle
  before update on public.document_versions
  for each row execute function private.validate_document_version_lifecycle();

create trigger document_publications_set_updated_at
  before update on public.document_publications
  for each row execute function private.set_updated_at();

create trigger document_publications_validate_version
  before insert or update on public.document_publications
  for each row execute function private.validate_document_publication();

alter table public.document_versions enable row level security;
alter table public.document_versions force row level security;

alter table public.document_publications enable row level security;
alter table public.document_publications force row level security;

create policy document_versions_select_own
  on public.document_versions
  for select
  to authenticated
  using ((select auth.uid()) = owner_id);

create policy document_versions_insert_own
  on public.document_versions
  for insert
  to authenticated
  with check ((select auth.uid()) = owner_id);

create policy document_versions_update_own
  on public.document_versions
  for update
  to authenticated
  using ((select auth.uid()) = owner_id)
  with check ((select auth.uid()) = owner_id);

create policy document_publications_select_own
  on public.document_publications
  for select
  to authenticated
  using ((select auth.uid()) = owner_id);

create policy document_publications_insert_own
  on public.document_publications
  for insert
  to authenticated
  with check ((select auth.uid()) = owner_id);

create policy document_publications_update_own
  on public.document_publications
  for update
  to authenticated
  using ((select auth.uid()) = owner_id)
  with check ((select auth.uid()) = owner_id);

create policy document_publications_delete_own
  on public.document_publications
  for delete
  to authenticated
  using ((select auth.uid()) = owner_id);

revoke all on public.document_versions from anon, authenticated;
grant select, insert on public.document_versions to authenticated;
grant update (
  label,
  extracted_text,
  extraction_status,
  extraction_error,
  is_default,
  archived_at
) on public.document_versions to authenticated;
grant all on public.document_versions to service_role;

revoke all on public.document_publications from anon, authenticated;
grant select, insert, delete on public.document_publications to authenticated;
grant update (document_version_id, published_at) on public.document_publications
  to authenticated;
grant all on public.document_publications to service_role;

grant execute on function private.set_updated_at() to authenticated, service_role;
grant execute on function private.validate_document_publication()
  to authenticated, service_role;
grant execute on function private.validate_document_version_lifecycle()
  to authenticated, service_role;

insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
values (
  'career-documents',
  'career-documents',
  false,
  20971520,
  array['application/pdf']::text[]
)
on conflict (id) do nothing;

do $$
declare
  bucket_is_public boolean;
  bucket_size_limit bigint;
  bucket_mime_types text[];
begin
  select bucket.public, bucket.file_size_limit, bucket.allowed_mime_types
    into bucket_is_public, bucket_size_limit, bucket_mime_types
    from storage.buckets as bucket
   where bucket.id = 'career-documents';

  if not found
     or bucket_is_public
     or bucket_size_limit <> 20971520
     or bucket_mime_types <> array['application/pdf']::text[] then
    raise exception using
      errcode = '23514',
      message = 'career-documents bucket has unexpected settings';
  end if;
end;
$$;

create policy career_documents_select_own
  on storage.objects
  for select
  to authenticated
  using (
    bucket_id = 'career-documents'
    and (select auth.uid())::text = owner_id
    and name ~ '^[0-9a-fA-F-]{36}/(resume|portfolio)/[0-9a-fA-F-]{36}\\.pdf$'
  );

create policy career_documents_insert_own
  on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'career-documents'
    and (select auth.uid())::text = owner_id
    and name ~ '^[0-9a-fA-F-]{36}/(resume|portfolio)/[0-9a-fA-F-]{36}\\.pdf$'
  );
