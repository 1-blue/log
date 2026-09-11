drop policy if exists career_documents_select_own on storage.objects;
drop policy if exists career_documents_insert_own on storage.objects;

create policy career_documents_select_own
  on storage.objects
  for select
  to authenticated
  using (
    bucket_id = 'career-documents'
    and (storage.foldername(name))[1] = (select auth.jwt()->>'sub')
    and name ~ '^[0-9a-fA-F-]{36}/(resume|portfolio)/[0-9a-fA-F-]{36}\.pdf$'
  );

create policy career_documents_insert_own
  on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'career-documents'
    and (storage.foldername(name))[1] = (select auth.jwt()->>'sub')
    and name ~ '^[0-9a-fA-F-]{36}/(resume|portfolio)/[0-9a-fA-F-]{36}\.pdf$'
  );
