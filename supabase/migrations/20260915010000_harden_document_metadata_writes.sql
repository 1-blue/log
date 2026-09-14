drop policy if exists document_versions_insert_own
  on public.document_versions;
drop policy if exists document_versions_update_own
  on public.document_versions;
drop policy if exists document_publications_insert_own
  on public.document_publications;
drop policy if exists document_publications_update_own
  on public.document_publications;
drop policy if exists document_publications_delete_own
  on public.document_publications;

revoke insert, update, delete, truncate
  on public.document_versions
  from authenticated;
revoke insert, update, delete, truncate
  on public.document_publications
  from authenticated;

revoke execute on function private.set_updated_at()
  from public, anon, authenticated;
revoke execute on function private.validate_document_publication()
  from public, anon, authenticated;
revoke execute on function private.validate_document_version_lifecycle()
  from public, anon, authenticated;

grant select on public.document_versions, public.document_publications
  to authenticated;
grant execute on function private.set_updated_at()
  to service_role;
grant execute on function private.validate_document_publication()
  to service_role;
grant execute on function private.validate_document_version_lifecycle()
  to service_role;
