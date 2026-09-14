create type public.slack_notification_event_type as enum (
  'job_posting_registered',
  'collection_succeeded',
  'collection_needs_input',
  'collection_failed',
  'analysis_queued',
  'analysis_succeeded',
  'analysis_retrying',
  'analysis_failed',
  'analysis_cancelled',
  'application_status_changed',
  'interview_scheduled'
);

create type public.slack_notification_target as enum (
  'job_root', 'job_thread', 'error_channel'
);

create type public.slack_notification_status as enum (
  'queued', 'dispatching', 'sent', 'failed', 'delivery_unknown', 'skipped'
);

create type public.slack_thread_status as enum (
  'pending', 'ready', 'failed', 'delivery_unknown'
);

create table public.slack_notifications (
  id uuid primary key default extensions.gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete restrict,
  event_id uuid not null unique,
  request_id uuid not null,
  dedupe_key text not null,
  event_type public.slack_notification_event_type not null,
  target public.slack_notification_target not null,
  route_key text not null,
  status public.slack_notification_status not null default 'queued',
  job_posting_id uuid not null,
  application_id uuid,
  collection_run_id uuid,
  analysis_job_id uuid,
  context jsonb not null default '{}'::jsonb,
  attempt_count integer not null default 0,
  not_before timestamptz not null default pg_catalog.now(),
  channel_id text,
  message_ts text,
  http_status integer,
  completion_event_id uuid unique,
  error_code text,
  error_message text,
  error_retryable boolean not null default false,
  dispatched_at timestamptz,
  finished_at timestamptz,
  created_at timestamptz not null default pg_catalog.now(),
  updated_at timestamptz not null default pg_catalog.now(),
  constraint slack_notifications_posting_fk
    foreign key (job_posting_id, owner_id)
    references public.job_postings (id, owner_id) on delete restrict,
  constraint slack_notifications_application_fk
    foreign key (application_id, owner_id)
    references public.applications (id, owner_id) on delete restrict,
  constraint slack_notifications_collection_fk
    foreign key (collection_run_id, owner_id)
    references public.job_posting_collection_runs (id, owner_id) on delete restrict,
  constraint slack_notifications_analysis_fk
    foreign key (analysis_job_id, owner_id)
    references public.analysis_jobs (id, owner_id) on delete restrict,
  constraint slack_notifications_owner_dedupe_key unique (owner_id, dedupe_key),
  constraint slack_notifications_id_owner_key unique (id, owner_id),
  constraint slack_notifications_dedupe_length
    check (pg_catalog.char_length(dedupe_key) between 1 and 300),
  constraint slack_notifications_route_check check (
    route_key = case when target = 'error_channel' then 'error_channel' else 'job_channel' end
  ),
  constraint slack_notifications_context_check check (
    pg_catalog.jsonb_typeof(context) = 'object'
    and pg_catalog.octet_length(context::text) <= 20000
  ),
  constraint slack_notifications_attempt_check check (attempt_count between 0 and 2),
  constraint slack_notifications_channel_length
    check (channel_id is null or pg_catalog.char_length(channel_id) between 2 and 80),
  constraint slack_notifications_message_ts_format
    check (message_ts is null or message_ts ~ '^\d{10,20}\.\d{6}$'),
  constraint slack_notifications_http_status_range
    check (http_status is null or http_status between 100 and 599),
  constraint slack_notifications_error_length check (
    (error_code is null or pg_catalog.char_length(error_code) between 1 and 100)
    and (error_message is null or pg_catalog.char_length(error_message) between 1 and 500)
  ),
  constraint slack_notifications_terminal_check check (
    (status in ('queued', 'dispatching') and finished_at is null)
    or (status in ('sent', 'failed', 'delivery_unknown', 'skipped') and finished_at is not null)
  ),
  constraint slack_notifications_error_check check (
    (status in ('failed', 'delivery_unknown') and error_code is not null and error_message is not null)
    or (status not in ('failed', 'delivery_unknown') and error_code is null and error_message is null and error_retryable = false)
  )
);

create unique index slack_notifications_one_root_idx
  on public.slack_notifications (job_posting_id)
  where target = 'job_root';
create unique index slack_notifications_one_dispatch_per_route_idx
  on public.slack_notifications (route_key)
  where status = 'dispatching';
create index slack_notifications_owner_created_idx
  on public.slack_notifications (owner_id, created_at desc, id desc);
create index slack_notifications_queue_idx
  on public.slack_notifications (route_key, not_before, created_at, id)
  where status = 'queued';

create table public.slack_job_threads (
  job_posting_id uuid primary key,
  owner_id uuid not null,
  root_notification_id uuid not null unique,
  status public.slack_thread_status not null default 'pending',
  channel_id text,
  thread_ts text,
  created_at timestamptz not null default pg_catalog.now(),
  updated_at timestamptz not null default pg_catalog.now(),
  constraint slack_job_threads_posting_fk
    foreign key (job_posting_id, owner_id)
    references public.job_postings (id, owner_id) on delete restrict,
  constraint slack_job_threads_notification_fk
    foreign key (root_notification_id, owner_id)
    references public.slack_notifications (id, owner_id) on delete restrict,
  constraint slack_job_threads_channel_length
    check (channel_id is null or pg_catalog.char_length(channel_id) between 2 and 80),
  constraint slack_job_threads_ts_format
    check (thread_ts is null or thread_ts ~ '^\d{10,20}\.\d{6}$'),
  constraint slack_job_threads_state_check check (
    (status = 'ready' and channel_id is not null and thread_ts is not null)
    or (status <> 'ready' and channel_id is null and thread_ts is null)
  )
);

create trigger slack_notifications_set_updated_at
  before update on public.slack_notifications
  for each row execute function private.set_updated_at();
create trigger slack_job_threads_set_updated_at
  before update on public.slack_job_threads
  for each row execute function private.set_updated_at();

create or replace function private.enqueue_slack_notification(
  p_owner_id uuid,
  p_job_posting_id uuid,
  p_event_type public.slack_notification_event_type,
  p_target public.slack_notification_target,
  p_dedupe_key text,
  p_request_id uuid,
  p_application_id uuid default null,
  p_collection_run_id uuid default null,
  p_analysis_job_id uuid default null,
  p_context jsonb default '{}'::jsonb
)
returns public.slack_notifications
language plpgsql security definer set search_path = '' as $$
declare
  root_notification public.slack_notifications;
  notification public.slack_notifications;
begin
  if p_target = 'job_thread' and not exists (
    select 1 from public.slack_job_threads where job_posting_id = p_job_posting_id
  ) then
    insert into public.slack_notifications (
      owner_id, event_id, request_id, dedupe_key, event_type, target,
      route_key, job_posting_id, context
    )
    select
      posting.owner_id,
      extensions.gen_random_uuid(),
      extensions.gen_random_uuid(),
      'job-posting:' || posting.id || ':registered',
      'job_posting_registered',
      'job_root',
      'job_channel',
      posting.id,
      pg_catalog.jsonb_build_object(
        'companyName', posting.company_name,
        'title', posting.title,
        'url', posting.canonical_url
      )
    from public.job_postings as posting
    where posting.id = p_job_posting_id and posting.owner_id = p_owner_id
    on conflict (owner_id, dedupe_key) do update set dedupe_key = excluded.dedupe_key
    returning * into root_notification;

    insert into public.slack_job_threads (
      job_posting_id, owner_id, root_notification_id
    ) values (
      p_job_posting_id, p_owner_id, root_notification.id
    ) on conflict (job_posting_id) do nothing;
  end if;

  insert into public.slack_notifications (
    owner_id, event_id, request_id, dedupe_key, event_type, target,
    route_key, job_posting_id, application_id, collection_run_id,
    analysis_job_id, context
  ) values (
    p_owner_id,
    extensions.gen_random_uuid(),
    p_request_id,
    p_dedupe_key,
    p_event_type,
    p_target,
    case when p_target = 'error_channel' then 'error_channel' else 'job_channel' end,
    p_job_posting_id,
    p_application_id,
    p_collection_run_id,
    p_analysis_job_id,
    pg_catalog.jsonb_strip_nulls(p_context)
  )
  on conflict (owner_id, dedupe_key) do update set dedupe_key = excluded.dedupe_key
  returning * into notification;

  if p_target = 'job_root' then
    insert into public.slack_job_threads (
      job_posting_id, owner_id, root_notification_id
    ) values (
      p_job_posting_id, p_owner_id, notification.id
    ) on conflict (job_posting_id) do nothing;
  end if;

  return notification;
end;
$$;

create or replace function private.enqueue_new_job_posting_slack()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  perform private.enqueue_slack_notification(
    new.owner_id,
    new.id,
    'job_posting_registered',
    'job_root',
    'job-posting:' || new.id || ':registered',
    extensions.gen_random_uuid(),
    null,
    null,
    null,
    pg_catalog.jsonb_build_object(
      'companyName', new.company_name,
      'title', new.title,
      'url', new.canonical_url
    )
  );
  return new;
end;
$$;

create trigger job_postings_enqueue_slack
  after insert on public.job_postings
  for each row execute function private.enqueue_new_job_posting_slack();

create or replace function private.enqueue_collection_slack()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  notification_type public.slack_notification_event_type;
  notification_target public.slack_notification_target;
  parser_version text;
begin
  if new.status is not distinct from old.status
     or new.status not in ('succeeded', 'needs_input', 'failed') then
    return new;
  end if;

  notification_type := case new.status
    when 'succeeded' then 'collection_succeeded'
    when 'needs_input' then 'collection_needs_input'
    else 'collection_failed'
  end;
  notification_target := case new.status
    when 'succeeded' then 'job_thread'
    else 'error_channel'
  end;
  if new.snapshot_id is not null then
    select snapshot.parser_version into parser_version
    from public.job_posting_snapshots as snapshot where snapshot.id = new.snapshot_id;
  end if;

  perform private.enqueue_slack_notification(
    new.owner_id,
    new.job_posting_id,
    notification_type,
    notification_target,
    'collection:' || new.id || ':' || new.status::text,
    new.request_id,
    null,
    new.id,
    null,
    pg_catalog.jsonb_build_object(
      'mode', new.mode,
      'status', new.status,
      'errorCode', new.error_code,
      'retryable', new.retryable,
      'httpStatus', new.http_status,
      'parserVersion', parser_version,
      'finishedAt', new.finished_at
    )
  );
  return new;
end;
$$;

create trigger job_posting_collections_enqueue_slack
  after update on public.job_posting_collection_runs
  for each row execute function private.enqueue_collection_slack();

create or replace function private.enqueue_analysis_created_slack()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  perform private.enqueue_slack_notification(
    new.owner_id,
    new.job_posting_id,
    'analysis_queued',
    'job_thread',
    'analysis:' || new.id || ':queued',
    new.request_id,
    new.application_id,
    null,
    new.id,
    pg_catalog.jsonb_build_object(
      'runAttempt', greatest(new.attempt_count, 1),
      'resumeVersionId', new.resume_version_id,
      'portfolioVersionId', new.portfolio_version_id
    )
  );
  return new;
end;
$$;

create trigger analysis_jobs_enqueue_slack
  after insert on public.analysis_jobs
  for each row execute function private.enqueue_analysis_created_slack();

create or replace function private.enqueue_analysis_event_slack()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  target_job public.analysis_jobs;
  notification_type public.slack_notification_event_type;
  notification_target public.slack_notification_target;
begin
  if new.event_type not in ('retrying', 'failed', 'needs_input', 'cancelled') then
    return new;
  end if;
  select * into target_job from public.analysis_jobs where id = new.analysis_job_id;
  notification_type := case new.event_type
    when 'retrying' then 'analysis_retrying'
    when 'cancelled' then 'analysis_cancelled'
    else 'analysis_failed'
  end;
  notification_target := case new.event_type
    when 'cancelled' then 'job_thread'
    else 'error_channel'
  end;

  perform private.enqueue_slack_notification(
    new.owner_id,
    target_job.job_posting_id,
    notification_type,
    notification_target,
    'analysis-event:' || new.event_id,
    target_job.request_id,
    target_job.application_id,
    null,
    target_job.id,
    pg_catalog.jsonb_build_object(
      'status', new.status,
      'stage', new.stage,
      'runAttempt', new.run_attempt,
      'retryAt', new.retry_at,
      'errorCode', new.error_code,
      'retryable', new.error_retryable
    )
  );
  return new;
end;
$$;

create trigger analysis_job_events_enqueue_slack
  after insert on public.analysis_job_events
  for each row execute function private.enqueue_analysis_event_slack();

create or replace function private.enqueue_analysis_result_slack()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  target_job public.analysis_jobs;
  compact_gaps jsonb;
begin
  select * into target_job from public.analysis_jobs where id = new.analysis_job_id;
  select coalesce(
    pg_catalog.jsonb_agg(
      pg_catalog.jsonb_build_object(
        'title', gap.value->>'title',
        'priority', gap.value->>'priority'
      ) order by gap.ordinality
    ),
    '[]'::jsonb
  ) into compact_gaps
  from (
    select value, ordinality
    from pg_catalog.jsonb_array_elements(new.result->'comparison'->'gaps') with ordinality
    order by case value->>'priority'
      when 'high' then 1 when 'medium' then 2 else 3 end, ordinality
    limit 3
  ) as gap;

  perform private.enqueue_slack_notification(
    new.owner_id,
    target_job.job_posting_id,
    'analysis_succeeded',
    'job_thread',
    'analysis:' || new.analysis_job_id || ':succeeded',
    target_job.request_id,
    target_job.application_id,
    null,
    target_job.id,
    pg_catalog.jsonb_build_object(
      'fitScore', new.result->'fitScore',
      'summary', new.result->'comparison'->>'summary',
      'gaps', compact_gaps,
      'runAttempt', target_job.attempt_count,
      'startedAt', target_job.started_at
    )
  );
  return new;
end;
$$;

create trigger analysis_results_enqueue_slack
  after insert on public.analysis_results
  for each row execute function private.enqueue_analysis_result_slack();

create or replace function private.enqueue_application_status_slack()
returns trigger language plpgsql security definer set search_path = '' as $$
declare target_application public.applications;
begin
  if new.from_status is null or new.from_status = new.to_status then return new; end if;
  select * into target_application from public.applications where id = new.application_id;
  perform private.enqueue_slack_notification(
    new.owner_id,
    target_application.job_posting_id,
    'application_status_changed',
    'job_thread',
    'application-status:' || new.id,
    extensions.gen_random_uuid(),
    new.application_id,
    null,
    null,
    pg_catalog.jsonb_build_object(
      'fromStatus', new.from_status,
      'toStatus', new.to_status,
      'changedAt', new.changed_at
    )
  );
  return new;
end;
$$;

create trigger application_status_history_enqueue_slack
  after insert on public.application_status_history
  for each row execute function private.enqueue_application_status_slack();

create or replace function private.enqueue_interview_schedule_slack()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.interview_at is not distinct from old.interview_at or new.interview_at is null then
    return new;
  end if;
  perform private.enqueue_slack_notification(
    new.owner_id,
    new.job_posting_id,
    'interview_scheduled',
    'job_thread',
    'application-interview:' || new.id || ':' || new.updated_at::text,
    extensions.gen_random_uuid(),
    new.id,
    null,
    null,
    pg_catalog.jsonb_build_object('interviewAt', new.interview_at)
  );
  return new;
end;
$$;

create trigger applications_enqueue_interview_slack
  after update on public.applications
  for each row execute function private.enqueue_interview_schedule_slack();

create or replace function public.claim_slack_notifications(p_limit integer default 2)
returns setof public.slack_notifications
language plpgsql security definer set search_path = '' as $$
declare target_route text; claimed public.slack_notifications;
begin
  if p_limit < 1 or p_limit > 2 then
    raise exception using errcode = '22023', message = 'Slack claim limit must be between 1 and 2';
  end if;
  foreach target_route in array array['job_channel', 'error_channel']
  loop
    exit when p_limit <= 0;
    if exists (
      select 1 from public.slack_notifications
      where route_key = target_route and status = 'dispatching'
    ) then continue; end if;

    select notification.* into claimed
    from public.slack_notifications as notification
    where notification.route_key = target_route
      and notification.status = 'queued'
      and notification.not_before <= pg_catalog.now()
      and (
        notification.target <> 'job_thread'
        or exists (
          select 1 from public.slack_job_threads as thread
          where thread.job_posting_id = notification.job_posting_id
            and thread.status = 'ready'
        )
      )
    order by notification.created_at, notification.id
    for update skip locked
    limit 1;
    if not found then continue; end if;

    update public.slack_notifications set
      status = 'dispatching',
      attempt_count = attempt_count + 1,
      dispatched_at = pg_catalog.now()
    where id = claimed.id and status = 'queued'
    returning * into claimed;
    if found then
      return next claimed;
      p_limit := p_limit - 1;
    end if;
  end loop;
end;
$$;

create or replace function public.fail_slack_notification_dispatch(
  p_notification_id uuid,
  p_error_message text,
  p_retryable boolean
)
returns public.slack_notifications
language plpgsql security definer set search_path = '' as $$
declare notification public.slack_notifications;
begin
  update public.slack_notifications set
    status = 'failed',
    error_code = 'N8N_DISPATCH_FAILED',
    error_message = pg_catalog.left(p_error_message, 500),
    error_retryable = p_retryable,
    finished_at = pg_catalog.now()
  where id = p_notification_id and status = 'dispatching'
  returning * into notification;
  if not found then
    raise exception using errcode = '23514', message = 'Slack notification is not dispatching';
  end if;
  if notification.target = 'job_root' then
    update public.slack_job_threads set status = 'failed'
    where root_notification_id = notification.id;
  end if;
  return notification;
end;
$$;

create or replace function public.complete_slack_notification(
  p_notification_id uuid,
  p_notification_event_id uuid,
  p_completion_event_id uuid,
  p_outcome public.slack_notification_status,
  p_channel_id text,
  p_message_ts text,
  p_http_status integer,
  p_error_code text,
  p_error_message text,
  p_error_retryable boolean,
  p_occurred_at timestamptz default pg_catalog.now()
)
returns public.slack_notifications
language plpgsql security definer set search_path = '' as $$
declare notification public.slack_notifications; existing_id uuid;
begin
  select id into existing_id from public.slack_notifications
  where completion_event_id = p_completion_event_id;
  if found then
    if existing_id = p_notification_id then
      select * into notification from public.slack_notifications where id = existing_id;
      return notification;
    end if;
    raise exception using errcode = '23505', message = 'Slack completion event ID is already used';
  end if;

  select * into notification from public.slack_notifications
  where id = p_notification_id for update;
  if not found then raise exception using errcode = 'P0002', message = 'Slack notification not found'; end if;
  if notification.event_id <> p_notification_event_id then
    raise exception using errcode = '23514', message = 'Slack notification event ID does not match';
  end if;
  if notification.status <> 'dispatching' then
    raise exception using errcode = '23514', message = 'Slack notification is not dispatching';
  end if;
  if p_outcome not in ('sent', 'failed', 'delivery_unknown') then
    raise exception using errcode = '22023', message = 'Invalid Slack delivery outcome';
  end if;
  if p_outcome = 'sent' then
    if p_error_code is not null or p_error_message is not null then
      raise exception using errcode = '23514', message = 'Successful Slack delivery cannot contain an error';
    end if;
    if notification.target <> 'error_channel' and (p_channel_id is null or p_message_ts is null) then
      raise exception using errcode = '23514', message = 'Slack channel and timestamp are required';
    end if;
  elsif p_error_code is null or p_error_message is null then
    raise exception using errcode = '23514', message = 'Slack failure requires an error';
  end if;

  update public.slack_notifications set
    status = p_outcome,
    channel_id = p_channel_id,
    message_ts = p_message_ts,
    http_status = p_http_status,
    completion_event_id = p_completion_event_id,
    error_code = p_error_code,
    error_message = p_error_message,
    error_retryable = p_error_retryable,
    finished_at = p_occurred_at
  where id = notification.id returning * into notification;

  if notification.target = 'job_root' then
    update public.slack_job_threads set
      status = case p_outcome
        when 'sent' then 'ready'::public.slack_thread_status
        when 'delivery_unknown' then 'delivery_unknown'::public.slack_thread_status
        else 'failed'::public.slack_thread_status
      end,
      channel_id = case when p_outcome = 'sent' then p_channel_id else null end,
      thread_ts = case when p_outcome = 'sent' then p_message_ts else null end
    where root_notification_id = notification.id;
  end if;
  return notification;
end;
$$;

create or replace function public.fail_stale_slack_notifications(
  p_cutoff timestamptz,
  p_limit integer default 100
)
returns setof uuid
language plpgsql security definer set search_path = '' as $$
declare notification_id uuid;
begin
  if p_limit < 1 or p_limit > 100 then
    raise exception using errcode = '22023', message = 'Slack stale limit must be between 1 and 100';
  end if;
  for notification_id in
    select id from public.slack_notifications
    where status = 'dispatching' and dispatched_at < p_cutoff
    order by dispatched_at, id
    for update skip locked limit p_limit
  loop
    update public.slack_notifications set
      status = 'delivery_unknown',
      error_code = 'SLACK_DELIVERY_UNKNOWN',
      error_message = 'Slack 전송 결과를 확인하지 못했습니다.',
      error_retryable = false,
      finished_at = pg_catalog.now()
    where id = notification_id;
    update public.slack_job_threads set status = 'delivery_unknown'
    where root_notification_id = notification_id;
    return next notification_id;
  end loop;
end;
$$;

alter table public.slack_notifications enable row level security;
alter table public.slack_job_threads enable row level security;
create policy "Owners can read Slack notifications" on public.slack_notifications
  for select to authenticated using ((select auth.uid()) = owner_id);
create policy "Owners can read Slack job threads" on public.slack_job_threads
  for select to authenticated using ((select auth.uid()) = owner_id);

revoke all on public.slack_notifications, public.slack_job_threads from anon, authenticated;
grant select on public.slack_notifications, public.slack_job_threads to authenticated;
grant all on public.slack_notifications, public.slack_job_threads to service_role;
revoke all on function public.claim_slack_notifications(integer) from public, anon, authenticated;
revoke all on function public.fail_slack_notification_dispatch(uuid, text, boolean) from public, anon, authenticated;
revoke all on function public.complete_slack_notification(uuid, uuid, uuid, public.slack_notification_status, text, text, integer, text, text, boolean, timestamptz) from public, anon, authenticated;
revoke all on function public.fail_stale_slack_notifications(timestamptz, integer) from public, anon, authenticated;
grant execute on function public.claim_slack_notifications(integer) to service_role;
grant execute on function public.fail_slack_notification_dispatch(uuid, text, boolean) to service_role;
grant execute on function public.complete_slack_notification(uuid, uuid, uuid, public.slack_notification_status, text, text, integer, text, text, boolean, timestamptz) to service_role;
grant execute on function public.fail_stale_slack_notifications(timestamptz, integer) to service_role;
