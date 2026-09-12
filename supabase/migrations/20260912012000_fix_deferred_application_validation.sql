create or replace function private.validate_application_consistency()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  current_application public.applications;
  selected_types integer;
begin
  select * into current_application
    from public.applications as existing
   where existing.id = new.id
     and existing.owner_id = new.owner_id;

  if private.application_status_requires_documents(current_application.status) then
    select pg_catalog.count(distinct selection.document_type)
      into selected_types
      from public.application_documents as selection
     where selection.application_id = current_application.id
       and selection.owner_id = current_application.owner_id;

    if current_application.documents_locked_at is null or selected_types <> 2 then
      raise exception using
        errcode = '23514',
        message = 'Submitted applications require locked resume and portfolio versions';
    end if;
  end if;

  if tg_op = 'UPDATE'
     and old.documents_locked_at is not null
     and new.documents_locked_at is distinct from old.documents_locked_at then
    raise exception using
      errcode = '23514',
      message = 'The application document lock cannot be changed';
  end if;

  return new;
end;
$$;
