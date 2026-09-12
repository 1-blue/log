create type public.api_idempotency_status as enum ('processing', 'completed');

create table public.api_idempotency_records (
  owner_id uuid not null references auth.users(id) on delete cascade,
  idempotency_key uuid not null,
  request_fingerprint text not null
    constraint api_idempotency_fingerprint_check
      check (request_fingerprint ~ '^[0-9a-f]{64}$'),
  request_method text not null
    constraint api_idempotency_method_check
      check (request_method in ('POST', 'PUT', 'PATCH', 'DELETE')),
  request_path text not null
    constraint api_idempotency_path_check
      check (
        pg_catalog.char_length(request_path) between 1 and 500
        and request_path like '/%'
      ),
  execution_id uuid not null,
  original_request_id uuid not null,
  status public.api_idempotency_status not null default 'processing',
  response_status integer,
  response_body jsonb,
  created_at timestamptz not null default pg_catalog.now(),
  completed_at timestamptz,
  expires_at timestamptz not null default (pg_catalog.now() + interval '5 minutes'),
  primary key (owner_id, idempotency_key),
  constraint api_idempotency_response_status_check
    check (response_status is null or response_status between 200 and 299),
  constraint api_idempotency_completed_state_check check (
    (
      status = 'processing'
      and response_status is null
      and response_body is null
      and completed_at is null
    )
    or (
      status = 'completed'
      and response_status is not null
      and response_body is not null
      and completed_at is not null
    )
  )
);

create index api_idempotency_expiry_idx
  on public.api_idempotency_records (expires_at);

alter table public.api_idempotency_records enable row level security;

revoke all on table public.api_idempotency_records from anon, authenticated;

create or replace function public.claim_api_idempotency_request(
  p_owner_id uuid,
  p_idempotency_key uuid,
  p_request_fingerprint text,
  p_request_method text,
  p_request_path text,
  p_execution_id uuid,
  p_request_id uuid
)
returns table (
  outcome text,
  stored_execution_id uuid,
  stored_request_id uuid,
  stored_response_status integer,
  stored_response_body jsonb
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  existing public.api_idempotency_records;
begin
  delete from public.api_idempotency_records
   where owner_id = p_owner_id
     and idempotency_key = p_idempotency_key
     and expires_at <= pg_catalog.now();

  insert into public.api_idempotency_records (
    owner_id,
    idempotency_key,
    request_fingerprint,
    request_method,
    request_path,
    execution_id,
    original_request_id
  ) values (
    p_owner_id,
    p_idempotency_key,
    p_request_fingerprint,
    p_request_method,
    p_request_path,
    p_execution_id,
    p_request_id
  )
  on conflict (owner_id, idempotency_key) do nothing;

  if found then
    return query select
      'claimed'::text,
      p_execution_id,
      p_request_id,
      null::integer,
      null::jsonb;
    return;
  end if;

  select * into existing
    from public.api_idempotency_records
   where owner_id = p_owner_id
     and idempotency_key = p_idempotency_key;

  if existing.request_fingerprint is distinct from p_request_fingerprint
     or existing.request_method is distinct from p_request_method
     or existing.request_path is distinct from p_request_path then
    return query select
      'conflict'::text,
      existing.execution_id,
      existing.original_request_id,
      null::integer,
      null::jsonb;
    return;
  end if;

  if existing.status = 'completed' then
    return query select
      'replay'::text,
      existing.execution_id,
      existing.original_request_id,
      existing.response_status,
      existing.response_body;
    return;
  end if;

  return query select
    'in_progress'::text,
    existing.execution_id,
    existing.original_request_id,
    null::integer,
    null::jsonb;
end;
$$;

create or replace function public.complete_api_idempotency_request(
  p_owner_id uuid,
  p_idempotency_key uuid,
  p_execution_id uuid,
  p_response_status integer,
  p_response_body jsonb
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.api_idempotency_records
     set status = 'completed',
         response_status = p_response_status,
         response_body = p_response_body,
         completed_at = pg_catalog.now(),
         expires_at = pg_catalog.now() + interval '24 hours'
   where owner_id = p_owner_id
     and idempotency_key = p_idempotency_key
     and execution_id = p_execution_id
     and status = 'processing';

  if not found then
    raise exception using
      errcode = 'P0002',
      message = 'The idempotency execution was not found';
  end if;
end;
$$;

create or replace function public.release_api_idempotency_request(
  p_owner_id uuid,
  p_idempotency_key uuid,
  p_execution_id uuid
)
returns void
language sql
security definer
set search_path = ''
as $$
  delete from public.api_idempotency_records
   where owner_id = p_owner_id
     and idempotency_key = p_idempotency_key
     and execution_id = p_execution_id
     and status = 'processing';
$$;

revoke all on function public.claim_api_idempotency_request(
  uuid, uuid, text, text, text, uuid, uuid
) from public, anon, authenticated;
revoke all on function public.complete_api_idempotency_request(
  uuid, uuid, uuid, integer, jsonb
) from public, anon, authenticated;
revoke all on function public.release_api_idempotency_request(
  uuid, uuid, uuid
) from public, anon, authenticated;

grant execute on function public.claim_api_idempotency_request(
  uuid, uuid, text, text, text, uuid, uuid
) to service_role;
grant execute on function public.complete_api_idempotency_request(
  uuid, uuid, uuid, integer, jsonb
) to service_role;
grant execute on function public.release_api_idempotency_request(
  uuid, uuid, uuid
) to service_role;
