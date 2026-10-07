create or replace function public.replace_application_state(
  p_owner_id uuid,
  p_application_id uuid,
  p_status public.application_status,
  p_applied_on date,
  p_interview_at timestamptz,
  p_note text,
  p_resume_version_id uuid,
  p_portfolio_version_id uuid,
  p_archived boolean
)
returns public.applications
language plpgsql
security invoker
set search_path = ''
as $$
declare
  current_application public.applications;
  application public.applications;
  current_resume_id uuid;
  current_portfolio_id uuid;
begin
  select * into current_application
    from public.applications as existing
   where existing.id = p_application_id
     and existing.owner_id = p_owner_id
   for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'An application was not found';
  end if;

  select selection.document_version_id into current_resume_id
    from public.application_documents as selection
   where selection.application_id = p_application_id
     and selection.document_type = 'resume';
  select selection.document_version_id into current_portfolio_id
    from public.application_documents as selection
   where selection.application_id = p_application_id
     and selection.document_type = 'portfolio';

  if current_application.documents_locked_at is not null
     and (
       current_resume_id is distinct from p_resume_version_id
       or current_portfolio_id is distinct from p_portfolio_version_id
     ) then
    raise exception using
      errcode = '23514',
      message = 'Submitted application documents cannot be changed';
  end if;

  if current_application.archived_at is not null and p_archived then
    if current_application.status is distinct from p_status
       or current_application.applied_on is distinct from p_applied_on
       or current_application.interview_at is distinct from p_interview_at
       or current_application.note is distinct from nullif(pg_catalog.btrim(p_note), '') then
      raise exception using
        errcode = '23514',
        message = 'Archived applications must be restored before editing';
    end if;
  end if;

  if current_application.documents_locked_at is null then
    -- Existing selections are historical references, not new selections.
    -- Keep each unchanged row, even if its document has since been archived.
    -- Changed selections still pass the owner/type/archive validation trigger.
    if current_resume_id is distinct from p_resume_version_id then
      delete from public.application_documents
       where application_id = p_application_id
         and document_type = 'resume';

      if p_resume_version_id is not null then
        insert into public.application_documents (
          application_id, owner_id, document_type, document_version_id
        ) values (p_application_id, p_owner_id, 'resume', p_resume_version_id);
      end if;
    end if;

    if current_portfolio_id is distinct from p_portfolio_version_id then
      delete from public.application_documents
       where application_id = p_application_id
         and document_type = 'portfolio';

      if p_portfolio_version_id is not null then
        insert into public.application_documents (
          application_id, owner_id, document_type, document_version_id
        ) values (p_application_id, p_owner_id, 'portfolio', p_portfolio_version_id);
      end if;
    end if;
  end if;

  if private.application_status_requires_documents(p_status)
     and (p_resume_version_id is null or p_portfolio_version_id is null) then
    raise exception using
      errcode = '23514',
      message = 'Submitted applications require resume and portfolio versions';
  end if;

  update public.applications
     set status = p_status,
         applied_on = p_applied_on,
         interview_at = p_interview_at,
         note = nullif(pg_catalog.btrim(p_note), ''),
         documents_locked_at = case
           when documents_locked_at is not null then documents_locked_at
           when private.application_status_requires_documents(p_status) then pg_catalog.now()
           else null
         end,
         archived_at = case
           when p_archived then coalesce(archived_at, pg_catalog.now())
           else null
         end
   where id = p_application_id
  returning * into application;

  return application;
end;
$$;
