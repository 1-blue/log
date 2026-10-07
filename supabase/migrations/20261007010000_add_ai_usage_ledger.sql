-- Append-only per-call accounting. References are snapshots, not cascading FKs:
-- deleting a document/application must not erase already incurred API costs.
create table public.ai_usage_calls (
  call_id uuid primary key,
  owner_id uuid not null references auth.users(id) on delete restrict,
  request_id uuid not null,
  operation text not null check (operation in ('document_ocr','job_posting_extraction','job_facts','profile_comparison')),
  resource_id uuid not null,
  model text not null check (char_length(model) between 1 and 200),
  response_id text,
  service_tier text,
  status text not null check (status in ('started','succeeded','failed','unknown')),
  usage jsonb,
  estimated_cost_usd numeric(20,10) check (estimated_cost_usd >= 0),
  pricing_version text,
  latency_ms integer check (latency_ms >= 0),
  attempt integer not null check (attempt between 1 and 20),
  run_attempt integer not null check (run_attempt between 1 and 20),
  started_at timestamptz not null,
  finished_at timestamptz,
  received_at timestamptz not null default now(),
  check (usage is null or jsonb_typeof(usage) = 'object'),
  check (estimated_cost_usd is null or (usage is not null and pricing_version is not null)),
  check ((status = 'started') = (finished_at is null))
);
create index ai_usage_calls_owner_time_idx on public.ai_usage_calls(owner_id, started_at desc);
create unique index ai_usage_calls_response_idx on public.ai_usage_calls(owner_id, response_id) where response_id is not null;

create table public.ai_balance_baselines (
  owner_id uuid primary key references auth.users(id) on delete restrict,
  balance_usd numeric(14,6) not null check (balance_usd between 0 and 1000000),
  recorded_at timestamptz not null,
  updated_at timestamptz not null default now()
);
alter table public.ai_usage_calls enable row level security;
alter table public.ai_balance_baselines enable row level security;
create policy "Owners can read AI usage" on public.ai_usage_calls for select to authenticated using ((select auth.uid()) = owner_id);
create policy "Owners can read balance baselines" on public.ai_balance_baselines for select to authenticated using ((select auth.uid()) = owner_id);
revoke all on public.ai_usage_calls, public.ai_balance_baselines from anon, authenticated;
grant select on public.ai_usage_calls, public.ai_balance_baselines to authenticated;
grant all on public.ai_usage_calls, public.ai_balance_baselines to service_role;
create trigger career_mutation_guard before insert or update or delete on public.ai_usage_calls
  for each row execute function private.guard_career_mutation();
create trigger career_mutation_guard before insert or update or delete on public.ai_balance_baselines
  for each row execute function private.guard_career_mutation();

create function public.record_ai_usage(p_owner_id uuid, p_call jsonb)
returns public.ai_usage_calls language plpgsql security invoker set search_path = '' as $$
declare existing public.ai_usage_calls; result public.ai_usage_calls; resource uuid := (p_call->>'resourceId')::uuid;
begin
  if exists(select 1 from public.career_ops_maintenance where owner_id = p_owner_id and enabled) then
    raise exception 'career_ops_maintenance' using errcode = '23514';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_call->>'callId', 0));
  select * into existing from public.ai_usage_calls where call_id = (p_call->>'callId')::uuid for update;
  if found then
    if existing.owner_id <> p_owner_id or existing.request_id <> (p_call->>'requestId')::uuid
       or existing.resource_id <> resource or existing.operation <> p_call->>'operation'
       or existing.attempt <> (p_call->>'attempt')::integer or existing.run_attempt <> (p_call->>'runAttempt')::integer then
      raise exception 'ai_usage_identity_conflict' using errcode = '23514';
    end if;
    -- Never downgrade a settled record or reprice a replay.
    if existing.status <> 'started' or p_call->>'status' = 'started' then return existing; end if;
    update public.ai_usage_calls set
      model = p_call->>'model', response_id = p_call->>'responseId', service_tier = p_call->>'serviceTier',
      status = p_call->>'status', usage = nullif(p_call->'usage', 'null'::jsonb),
      estimated_cost_usd = (p_call->>'estimatedCostUsd')::numeric, pricing_version = p_call->>'pricingVersion',
      latency_ms = (p_call->>'latencyMs')::integer, finished_at = (p_call->>'occurredAt')::timestamptz
      where call_id = existing.call_id returning * into result;
    return result;
  end if;
  -- A late callback cannot create a journal entry for a deleted resource.
  if p_call->>'operation' = 'document_ocr' then
    if not exists(select 1 from public.document_versions where id = resource and owner_id = p_owner_id) then
      raise exception 'ai_usage_resource_not_found' using errcode = 'P0002';
    end if;
  elsif p_call->>'operation' = 'job_posting_extraction' then
    if not exists(select 1 from public.job_posting_collection_runs where id = resource and owner_id = p_owner_id) then
      raise exception 'ai_usage_resource_not_found' using errcode = 'P0002';
    end if;
  else
    if not exists(select 1 from public.analysis_jobs where id = resource and owner_id = p_owner_id) then
      raise exception 'ai_usage_resource_not_found' using errcode = 'P0002';
    end if;
  end if;
  if p_call->>'status' <> 'started' then
    raise exception 'ai_usage_start_required' using errcode = '23514';
  end if;
  insert into public.ai_usage_calls(call_id,owner_id,request_id,operation,resource_id,model,status,attempt,run_attempt,started_at)
  values((p_call->>'callId')::uuid,p_owner_id,(p_call->>'requestId')::uuid,p_call->>'operation',resource,p_call->>'model','started',
    (p_call->>'attempt')::integer,(p_call->>'runAttempt')::integer,(p_call->>'occurredAt')::timestamptz)
  returning * into result;
  return result;
end $$;
revoke all on function public.record_ai_usage(uuid,jsonb) from public, anon, authenticated;
grant execute on function public.record_ai_usage(uuid,jsonb) to service_role;
