begin;

insert into auth.users (
  id, instance_id, aud, role, email, encrypted_password,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values (
  '00000000-0000-4000-8000-000000000091',
  '00000000-0000-0000-0000-000000000000',
  'authenticated',
  'authenticated',
  'application-integration@example.com',
  '',
  '{"provider":"email","providers":["email"]}',
  '{}',
  pg_catalog.now(),
  pg_catalog.now()
) on conflict (id) do nothing;

insert into public.document_versions (
  id, owner_id, document_type, label, original_filename,
  storage_path, mime_type, file_size, content_hash
) values
  (
    '00000000-0000-4000-8000-000000000092',
    '00000000-0000-4000-8000-000000000091',
    'resume', 'Integration resume', 'resume.pdf',
    '00000000-0000-4000-8000-000000000091/resume/00000000-0000-4000-8000-000000000092.pdf',
    'application/pdf', 1, pg_catalog.repeat('a', 64)
  ),
  (
    '00000000-0000-4000-8000-000000000093',
    '00000000-0000-4000-8000-000000000091',
    'portfolio', 'Integration portfolio', 'portfolio.pdf',
    '00000000-0000-4000-8000-000000000091/portfolio/00000000-0000-4000-8000-000000000093.pdf',
    'application/pdf', 1, pg_catalog.repeat('b', 64)
  );

do $$
declare
  first_application public.applications;
  second_application public.applications;
  submitted_application public.applications;
  history_count integer;
begin
  select * into first_application
    from public.create_application_with_posting(
      '00000000-0000-4000-8000-000000000091',
      'wanted',
      '384409',
      'https://www.wanted.co.kr/wd/384409',
      '미리디',
      'AX Engineer - Infra',
      'interested',
      null,
      null,
      null,
      null,
      null
    );

  begin
    perform public.replace_application_state(
      '00000000-0000-4000-8000-000000000091',
      first_application.id,
      'applied',
      current_date,
      null,
      null,
      null,
      null,
      false
    );
    raise exception 'missing documents were accepted';
  exception
    when check_violation then null;
  end;

  select * into first_application
    from public.replace_application_state(
      '00000000-0000-4000-8000-000000000091',
      first_application.id,
      'applied',
      current_date,
      null,
      'submitted',
      '00000000-0000-4000-8000-000000000092',
      '00000000-0000-4000-8000-000000000093',
      false
    );
  if first_application.documents_locked_at is null then
    raise exception 'submitted document selection was not locked';
  end if;

  select * into second_application
    from public.create_application_attempt(
      '00000000-0000-4000-8000-000000000091',
      first_application.job_posting_id,
      'interested',
      null,
      null,
      null,
      null,
      null
    );
  if second_application.attempt_number <> 2 then
    raise exception 'reapplication attempt number is invalid';
  end if;

  select * into first_application
    from public.replace_application_state(
      '00000000-0000-4000-8000-000000000091',
      first_application.id,
      'applied',
      current_date,
      null,
      'submitted',
      '00000000-0000-4000-8000-000000000092',
      '00000000-0000-4000-8000-000000000093',
      true
    );
  if first_application.archived_at is null or first_application.status <> 'applied' then
    raise exception 'archive changed business state';
  end if;

  select pg_catalog.count(*) into history_count
    from public.application_status_history
   where application_id = first_application.id;
  if history_count <> 2 then
    raise exception 'status history is incomplete';
  end if;

  select * into submitted_application
    from public.create_application_with_posting(
      '00000000-0000-4000-8000-000000000091',
      'wanted',
      '384410',
      'https://www.wanted.co.kr/wd/384410',
      '테스트 회사',
      'Submitted from creation',
      'applied',
      current_date,
      null,
      null,
      '00000000-0000-4000-8000-000000000092',
      '00000000-0000-4000-8000-000000000093'
    );
  if submitted_application.documents_locked_at is null then
    raise exception 'initially submitted application was not locked';
  end if;
end;
$$;

rollback;
