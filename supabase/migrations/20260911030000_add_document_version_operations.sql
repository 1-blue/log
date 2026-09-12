create or replace function public.register_document_version(
  p_id uuid,
  p_owner_id uuid,
  p_document_type public.document_type,
  p_label text,
  p_original_filename text,
  p_storage_path text,
  p_mime_type text,
  p_file_size bigint,
  p_content_hash text
)
returns public.document_versions
language plpgsql
security invoker
set search_path = ''
as $$
declare
  inserted_version public.document_versions;
  should_be_default boolean;
begin
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      p_owner_id::text || ':' || p_document_type::text,
      0
    )
  );

  select not exists (
    select 1
      from public.document_versions as document_version
     where document_version.owner_id = p_owner_id
       and document_version.document_type = p_document_type
       and document_version.is_default
       and document_version.archived_at is null
  ) into should_be_default;

  insert into public.document_versions (
    id,
    owner_id,
    document_type,
    label,
    original_filename,
    storage_path,
    mime_type,
    file_size,
    content_hash,
    is_default
  ) values (
    p_id,
    p_owner_id,
    p_document_type,
    p_label,
    p_original_filename,
    p_storage_path,
    p_mime_type,
    p_file_size,
    p_content_hash,
    should_be_default
  )
  returning * into inserted_version;

  return inserted_version;
end;
$$;

create or replace function public.set_default_document_version(
  p_owner_id uuid,
  p_document_type public.document_type,
  p_document_version_id uuid
)
returns public.document_versions
language plpgsql
security invoker
set search_path = ''
as $$
declare
  selected_version public.document_versions;
begin
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      p_owner_id::text || ':' || p_document_type::text,
      0
    )
  );

  select *
    into selected_version
    from public.document_versions as document_version
   where document_version.id = p_document_version_id
     and document_version.owner_id = p_owner_id
     and document_version.document_type = p_document_type
     and document_version.archived_at is null
   for update;

  if not found then
    raise exception using
      errcode = 'P0002',
      message = 'An active document version was not found';
  end if;

  update public.document_versions
     set is_default = false
   where owner_id = p_owner_id
     and document_type = p_document_type
     and is_default
     and id <> p_document_version_id;

  update public.document_versions
     set is_default = true
   where id = p_document_version_id
  returning * into selected_version;

  return selected_version;
end;
$$;

revoke all on function public.register_document_version(
  uuid,
  uuid,
  public.document_type,
  text,
  text,
  text,
  text,
  bigint,
  text
) from public, anon, authenticated;

revoke all on function public.set_default_document_version(
  uuid,
  public.document_type,
  uuid
) from public, anon, authenticated;

grant execute on function public.register_document_version(
  uuid,
  uuid,
  public.document_type,
  text,
  text,
  text,
  text,
  bigint,
  text
) to service_role;

grant execute on function public.set_default_document_version(
  uuid,
  public.document_type,
  uuid
) to service_role;
