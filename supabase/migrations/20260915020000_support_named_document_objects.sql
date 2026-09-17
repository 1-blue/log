-- New uploads use an ASCII-safe readable label and the first six hexadecimal
-- characters of the document version id. The original Korean label remains in
-- document_versions.label and original_filename. Existing UUID-only paths
-- remain valid and are not renamed.

alter table public.document_versions
  drop constraint document_versions_storage_path_check;

alter table public.document_versions
  add constraint document_versions_storage_path_check
  check (
    storage_path = pg_catalog.format(
      '%s/%s/%s.pdf',
      owner_id,
      document_type,
      id
    )
    or (
      storage_path ~ pg_catalog.format(
        '^%s/%s/[A-Za-z0-9_-]+-%s\.pdf$',
        owner_id,
        document_type,
        pg_catalog.left(pg_catalog.replace(id::text, '-', ''), 6)
      )
    )
  );

drop policy if exists career_documents_select_own on storage.objects;
drop policy if exists career_documents_insert_own on storage.objects;
drop policy if exists career_documents_delete_own on storage.objects;

create policy career_documents_select_own
  on storage.objects
  for select
  to authenticated
  using (
    bucket_id = 'career-documents'
    and (storage.foldername(name))[1] = (select auth.jwt()->>'sub')
    and name ~ '^[0-9a-fA-F-]{36}/(resume|portfolio)/(?:[0-9a-fA-F-]{36}|[A-Za-z0-9_-]+-[0-9a-f]{6})\.pdf$'
  );

create policy career_documents_insert_own
  on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'career-documents'
    and (storage.foldername(name))[1] = (select auth.jwt()->>'sub')
    and name ~ '^[0-9a-fA-F-]{36}/(resume|portfolio)/(?:[0-9a-fA-F-]{36}|[A-Za-z0-9_-]+-[0-9a-f]{6})\.pdf$'
  );

create policy career_documents_delete_own
  on storage.objects
  for delete
  to authenticated
  using (
    bucket_id = 'career-documents'
    and (storage.foldername(name))[1] = (select auth.jwt()->>'sub')
    and name ~ '^[0-9a-fA-F-]{36}/(resume|portfolio)/(?:[0-9a-fA-F-]{36}|[A-Za-z0-9_-]+-[0-9a-f]{6})\.pdf$'
  );
