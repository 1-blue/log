create type public.job_posting_source as enum ('wanted');

create type public.application_status as enum (
  'interested',
  'preparing',
  'applied',
  'screening',
  'interview',
  'offer',
  'rejected',
  'withdrawn'
);

create table public.job_postings (
  id uuid primary key default extensions.gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete restrict,
  source public.job_posting_source not null,
  external_id text not null
    constraint job_postings_external_id_check check (external_id ~ '^[0-9]+$'),
  canonical_url text not null,
  company_name text not null
    constraint job_postings_company_name_length
      check (pg_catalog.char_length(pg_catalog.btrim(company_name)) between 1 and 200),
  title text not null
    constraint job_postings_title_length
      check (pg_catalog.char_length(pg_catalog.btrim(title)) between 1 and 300),
  search_text text generated always as (
    pg_catalog.lower(company_name || ' ' || title || ' ' || external_id)
  ) stored,
  created_at timestamptz not null default pg_catalog.now(),
  updated_at timestamptz not null default pg_catalog.now(),
  constraint job_postings_canonical_url_check check (
    canonical_url = 'https://www.wanted.co.kr/wd/' || external_id
  ),
  constraint job_postings_owner_source_external_key
    unique (owner_id, source, external_id),
  constraint job_postings_id_owner_key unique (id, owner_id)
);

create table public.applications (
  id uuid primary key default extensions.gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete restrict,
  job_posting_id uuid not null,
  attempt_number integer not null
    constraint applications_attempt_number_check check (attempt_number > 0),
  status public.application_status not null default 'interested',
  applied_on date,
  interview_at timestamptz,
  note text
    constraint applications_note_length check (pg_catalog.char_length(note) <= 10000),
  documents_locked_at timestamptz,
  archived_at timestamptz,
  created_at timestamptz not null default pg_catalog.now(),
  updated_at timestamptz not null default pg_catalog.now(),
  constraint applications_job_posting_fk
    foreign key (job_posting_id, owner_id)
    references public.job_postings (id, owner_id)
    on delete restrict,
  constraint applications_owner_posting_attempt_key
    unique (owner_id, job_posting_id, attempt_number),
  constraint applications_id_owner_key unique (id, owner_id)
);

create table public.application_documents (
  application_id uuid not null,
  owner_id uuid not null,
  document_type public.document_type not null,
  document_version_id uuid not null,
  selected_at timestamptz not null default pg_catalog.now(),
  primary key (application_id, document_type),
  constraint application_documents_application_fk
    foreign key (application_id, owner_id)
    references public.applications (id, owner_id)
    on delete restrict,
  constraint application_documents_version_fk
    foreign key (document_version_id, owner_id, document_type)
    references public.document_versions (id, owner_id, document_type)
    on delete restrict
);

create table public.application_status_history (
  id uuid primary key default extensions.gen_random_uuid(),
  owner_id uuid not null,
  application_id uuid not null,
  from_status public.application_status,
  to_status public.application_status not null,
  changed_at timestamptz not null default pg_catalog.now(),
  constraint application_status_history_application_fk
    foreign key (application_id, owner_id)
    references public.applications (id, owner_id)
    on delete restrict
);

create index job_postings_owner_updated_idx
  on public.job_postings (owner_id, updated_at desc, id desc);

create index applications_owner_active_updated_idx
  on public.applications (owner_id, updated_at desc, id desc)
  where archived_at is null;

create index applications_owner_status_updated_idx
  on public.applications (owner_id, status, updated_at desc, id desc);

create index applications_owner_interview_idx
  on public.applications (owner_id, interview_at, id)
  where archived_at is null and interview_at is not null;

create index application_documents_version_idx
  on public.application_documents (document_version_id);

create index application_status_history_application_changed_idx
  on public.application_status_history (application_id, changed_at desc, id desc);

create or replace function private.application_status_requires_documents(
  status_value public.application_status
)
returns boolean
language sql
immutable
strict
set search_path = ''
as $$
  select status_value in (
    'applied'::public.application_status,
    'screening'::public.application_status,
    'interview'::public.application_status,
    'offer'::public.application_status,
    'rejected'::public.application_status
  );
$$;

create or replace function private.protect_job_posting_identity()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.owner_id is distinct from old.owner_id
     or new.source is distinct from old.source
     or new.external_id is distinct from old.external_id
     or new.canonical_url is distinct from old.canonical_url then
    raise exception using
      errcode = '23514',
      message = 'A job posting identity cannot be changed';
  end if;
  return new;
end;
$$;

create or replace function private.validate_application_document_change()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  target_application_id uuid := case when tg_op = 'DELETE' then old.application_id else new.application_id end;
  target_owner_id uuid := case when tg_op = 'DELETE' then old.owner_id else new.owner_id end;
  locked_at timestamptz;
  version_archived_at timestamptz;
begin
  select application.documents_locked_at
    into locked_at
    from public.applications as application
   where application.id = target_application_id
     and application.owner_id = target_owner_id;

  if locked_at is not null then
    raise exception using
      errcode = '23514',
      message = 'Submitted application documents cannot be changed';
  end if;

  if tg_op <> 'DELETE' then
    select document_version.archived_at
      into version_archived_at
      from public.document_versions as document_version
     where document_version.id = new.document_version_id
       and document_version.owner_id = new.owner_id
       and document_version.document_type = new.document_type;

    if not found then
      raise exception using
        errcode = '23503',
        message = 'The selected document does not match its owner and type';
    end if;

    if version_archived_at is not null then
      raise exception using
        errcode = '23514',
        message = 'An archived document cannot be selected';
    end if;
  end if;

  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

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

create or replace function private.record_application_status_history()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' or new.status is distinct from old.status then
    insert into public.application_status_history (
      owner_id,
      application_id,
      from_status,
      to_status
    ) values (
      new.owner_id,
      new.id,
      case when tg_op = 'INSERT' then null else old.status end,
      new.status
    );
  end if;
  return new;
end;
$$;

create trigger job_postings_set_updated_at
  before update on public.job_postings
  for each row execute function private.set_updated_at();

create trigger job_postings_protect_identity
  before update on public.job_postings
  for each row execute function private.protect_job_posting_identity();

create trigger applications_set_updated_at
  before update on public.applications
  for each row execute function private.set_updated_at();

create trigger application_documents_validate_change
  before insert or update or delete on public.application_documents
  for each row execute function private.validate_application_document_change();

create constraint trigger applications_validate_consistency
  after insert or update on public.applications
  deferrable initially deferred
  for each row execute function private.validate_application_consistency();

create trigger applications_record_status_history
  after insert or update of status on public.applications
  for each row execute function private.record_application_status_history();

create or replace function public.create_application_with_posting(
  p_owner_id uuid,
  p_source public.job_posting_source,
  p_external_id text,
  p_canonical_url text,
  p_company_name text,
  p_title text,
  p_status public.application_status,
  p_applied_on date,
  p_interview_at timestamptz,
  p_note text,
  p_resume_version_id uuid,
  p_portfolio_version_id uuid
)
returns public.applications
language plpgsql
security invoker
set search_path = ''
as $$
declare
  posting public.job_postings;
  application public.applications;
begin
  if private.application_status_requires_documents(p_status)
     and (p_resume_version_id is null or p_portfolio_version_id is null) then
    raise exception using
      errcode = '23514',
      message = 'Submitted applications require resume and portfolio versions';
  end if;

  insert into public.job_postings (
    owner_id, source, external_id, canonical_url, company_name, title
  ) values (
    p_owner_id, p_source, p_external_id, p_canonical_url,
    pg_catalog.btrim(p_company_name), pg_catalog.btrim(p_title)
  ) returning * into posting;

  insert into public.applications (
    owner_id, job_posting_id, attempt_number, status,
    applied_on, interview_at, note
  ) values (
    p_owner_id, posting.id, 1, p_status,
    p_applied_on, p_interview_at, nullif(pg_catalog.btrim(p_note), '')
  ) returning * into application;

  if p_resume_version_id is not null then
    insert into public.application_documents (
      application_id, owner_id, document_type, document_version_id
    ) values (application.id, p_owner_id, 'resume', p_resume_version_id);
  end if;

  if p_portfolio_version_id is not null then
    insert into public.application_documents (
      application_id, owner_id, document_type, document_version_id
    ) values (application.id, p_owner_id, 'portfolio', p_portfolio_version_id);
  end if;

  if private.application_status_requires_documents(p_status) then
    update public.applications
       set documents_locked_at = pg_catalog.now()
     where id = application.id
    returning * into application;
  end if;

  return application;
end;
$$;

create or replace function public.create_application_attempt(
  p_owner_id uuid,
  p_job_posting_id uuid,
  p_status public.application_status,
  p_applied_on date,
  p_interview_at timestamptz,
  p_note text,
  p_resume_version_id uuid,
  p_portfolio_version_id uuid
)
returns public.applications
language plpgsql
security invoker
set search_path = ''
as $$
declare
  next_attempt integer;
  application public.applications;
begin
  perform 1
    from public.job_postings as posting
   where posting.id = p_job_posting_id
     and posting.owner_id = p_owner_id
   for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'A job posting was not found';
  end if;

  if private.application_status_requires_documents(p_status)
     and (p_resume_version_id is null or p_portfolio_version_id is null) then
    raise exception using
      errcode = '23514',
      message = 'Submitted applications require resume and portfolio versions';
  end if;

  select pg_catalog.coalesce(pg_catalog.max(existing.attempt_number), 0) + 1
    into next_attempt
    from public.applications as existing
   where existing.owner_id = p_owner_id
     and existing.job_posting_id = p_job_posting_id;

  insert into public.applications (
    owner_id, job_posting_id, attempt_number, status,
    applied_on, interview_at, note
  ) values (
    p_owner_id, p_job_posting_id, next_attempt, p_status,
    p_applied_on, p_interview_at, nullif(pg_catalog.btrim(p_note), '')
  ) returning * into application;

  if p_resume_version_id is not null then
    insert into public.application_documents (
      application_id, owner_id, document_type, document_version_id
    ) values (application.id, p_owner_id, 'resume', p_resume_version_id);
  end if;

  if p_portfolio_version_id is not null then
    insert into public.application_documents (
      application_id, owner_id, document_type, document_version_id
    ) values (application.id, p_owner_id, 'portfolio', p_portfolio_version_id);
  end if;

  if private.application_status_requires_documents(p_status) then
    update public.applications
       set documents_locked_at = pg_catalog.now()
     where id = application.id
    returning * into application;
  end if;

  return application;
end;
$$;

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
    delete from public.application_documents
     where application_id = p_application_id;

    if p_resume_version_id is not null then
      insert into public.application_documents (
        application_id, owner_id, document_type, document_version_id
      ) values (p_application_id, p_owner_id, 'resume', p_resume_version_id);
    end if;
    if p_portfolio_version_id is not null then
      insert into public.application_documents (
        application_id, owner_id, document_type, document_version_id
      ) values (p_application_id, p_owner_id, 'portfolio', p_portfolio_version_id);
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
           when p_archived then pg_catalog.coalesce(archived_at, pg_catalog.now())
           else null
         end
   where id = p_application_id
  returning * into application;

  return application;
end;
$$;

create or replace function public.update_job_posting_details(
  p_owner_id uuid,
  p_job_posting_id uuid,
  p_company_name text,
  p_title text
)
returns public.job_postings
language sql
security invoker
set search_path = ''
as $$
  update public.job_postings
     set company_name = pg_catalog.btrim(p_company_name),
         title = pg_catalog.btrim(p_title)
   where id = p_job_posting_id
     and owner_id = p_owner_id
  returning *;
$$;

alter table public.job_postings enable row level security;
alter table public.job_postings force row level security;
alter table public.applications enable row level security;
alter table public.applications force row level security;
alter table public.application_documents enable row level security;
alter table public.application_documents force row level security;
alter table public.application_status_history enable row level security;
alter table public.application_status_history force row level security;

create policy job_postings_select_own on public.job_postings
  for select to authenticated using ((select auth.uid()) = owner_id);
create policy applications_select_own on public.applications
  for select to authenticated using ((select auth.uid()) = owner_id);
create policy application_documents_select_own on public.application_documents
  for select to authenticated using ((select auth.uid()) = owner_id);
create policy application_status_history_select_own on public.application_status_history
  for select to authenticated using ((select auth.uid()) = owner_id);

revoke all on public.job_postings from anon, authenticated;
revoke all on public.applications from anon, authenticated;
revoke all on public.application_documents from anon, authenticated;
revoke all on public.application_status_history from anon, authenticated;
grant select on public.job_postings to authenticated;
grant select on public.applications to authenticated;
grant select on public.application_documents to authenticated;
grant select on public.application_status_history to authenticated;
grant all on public.job_postings to service_role;
grant all on public.applications to service_role;
grant all on public.application_documents to service_role;
grant all on public.application_status_history to service_role;

revoke all on function public.create_application_with_posting(
  uuid, public.job_posting_source, text, text, text, text,
  public.application_status, date, timestamptz, text, uuid, uuid
) from public, anon, authenticated;
revoke all on function public.create_application_attempt(
  uuid, uuid, public.application_status, date, timestamptz, text, uuid, uuid
) from public, anon, authenticated;
revoke all on function public.replace_application_state(
  uuid, uuid, public.application_status, date, timestamptz, text, uuid, uuid, boolean
) from public, anon, authenticated;
revoke all on function public.update_job_posting_details(
  uuid, uuid, text, text
) from public, anon, authenticated;

grant execute on function public.create_application_with_posting(
  uuid, public.job_posting_source, text, text, text, text,
  public.application_status, date, timestamptz, text, uuid, uuid
) to service_role;
grant execute on function public.create_application_attempt(
  uuid, uuid, public.application_status, date, timestamptz, text, uuid, uuid
) to service_role;
grant execute on function public.replace_application_state(
  uuid, uuid, public.application_status, date, timestamptz, text, uuid, uuid, boolean
) to service_role;
grant execute on function public.update_job_posting_details(
  uuid, uuid, text, text
) to service_role;
