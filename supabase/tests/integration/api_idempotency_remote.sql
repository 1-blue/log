begin;

insert into auth.users (
  id, instance_id, aud, role, email, encrypted_password,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values (
  '00000000-0000-4000-8000-000000000101',
  '00000000-0000-0000-0000-000000000000',
  'authenticated',
  'authenticated',
  'idempotency-integration@example.com',
  '',
  '{"provider":"email","providers":["email"]}',
  '{}',
  pg_catalog.now(),
  pg_catalog.now()
) on conflict (id) do nothing;

do $$
declare
  result record;
  record_count integer;
begin
  if pg_catalog.has_table_privilege(
    'authenticated',
    'public.api_idempotency_records',
    'select'
  ) then
    raise exception 'authenticated can read idempotency records';
  end if;

  if pg_catalog.has_function_privilege(
    'authenticated',
    'public.claim_api_idempotency_request(uuid,uuid,text,text,text,uuid,uuid)',
    'execute'
  ) then
    raise exception 'authenticated can claim idempotency records';
  end if;

  select * into result
    from public.claim_api_idempotency_request(
      '00000000-0000-4000-8000-000000000101',
      '00000000-0000-4000-8000-000000000102',
      pg_catalog.repeat('a', 64),
      'POST',
      '/v1/applications',
      '00000000-0000-4000-8000-000000000103',
      '00000000-0000-4000-8000-000000000104'
    );
  if result.outcome <> 'claimed' then
    raise exception 'first request was not claimed';
  end if;

  select * into result
    from public.claim_api_idempotency_request(
      '00000000-0000-4000-8000-000000000101',
      '00000000-0000-4000-8000-000000000102',
      pg_catalog.repeat('a', 64),
      'POST',
      '/v1/applications',
      '00000000-0000-4000-8000-000000000105',
      '00000000-0000-4000-8000-000000000106'
    );
  if result.outcome <> 'in_progress' then
    raise exception 'concurrent duplicate was not detected';
  end if;

  select * into result
    from public.claim_api_idempotency_request(
      '00000000-0000-4000-8000-000000000101',
      '00000000-0000-4000-8000-000000000102',
      pg_catalog.repeat('b', 64),
      'POST',
      '/v1/applications',
      '00000000-0000-4000-8000-000000000105',
      '00000000-0000-4000-8000-000000000106'
    );
  if result.outcome <> 'conflict' then
    raise exception 'idempotency key reuse was not rejected';
  end if;

  perform public.complete_api_idempotency_request(
    '00000000-0000-4000-8000-000000000101',
    '00000000-0000-4000-8000-000000000102',
    '00000000-0000-4000-8000-000000000103',
    201,
    '{"data":{"id":"00000000-0000-4000-8000-000000000107"}}'::jsonb
  );

  select * into result
    from public.claim_api_idempotency_request(
      '00000000-0000-4000-8000-000000000101',
      '00000000-0000-4000-8000-000000000102',
      pg_catalog.repeat('a', 64),
      'POST',
      '/v1/applications',
      '00000000-0000-4000-8000-000000000105',
      '00000000-0000-4000-8000-000000000106'
    );
  if result.outcome <> 'replay'
     or result.stored_response_status <> 201
     or result.stored_request_id <> '00000000-0000-4000-8000-000000000104'
     or result.stored_response_body #>> '{data,id}'
        <> '00000000-0000-4000-8000-000000000107' then
    raise exception 'completed response was not replayed';
  end if;

  perform public.claim_api_idempotency_request(
    '00000000-0000-4000-8000-000000000101',
    '00000000-0000-4000-8000-000000000108',
    pg_catalog.repeat('c', 64),
    'POST',
    '/v1/document-versions/uploads',
    '00000000-0000-4000-8000-000000000109',
    '00000000-0000-4000-8000-000000000110'
  );
  perform public.release_api_idempotency_request(
    '00000000-0000-4000-8000-000000000101',
    '00000000-0000-4000-8000-000000000108',
    '00000000-0000-4000-8000-000000000109'
  );
  select pg_catalog.count(*) into record_count
    from public.api_idempotency_records
   where owner_id = '00000000-0000-4000-8000-000000000101'
     and idempotency_key = '00000000-0000-4000-8000-000000000108';
  if record_count <> 0 then
    raise exception 'failed request claim was not released';
  end if;
end;
$$;

rollback;
