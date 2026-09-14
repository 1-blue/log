begin;

set local search_path = public, extensions;

select plan(35);

select has_table('public', 'slack_notifications', 'Slack outbox table exists');
select has_table('public', 'slack_job_threads', 'Slack thread table exists');
select is(
  pg_catalog.has_function_privilege('authenticated', 'public.claim_slack_notifications(integer)', 'execute'),
  false,
  'authenticated clients cannot claim Slack notifications'
);
select is(
  pg_catalog.has_function_privilege(
    'authenticated',
    'public.complete_slack_notification(uuid,uuid,uuid,public.slack_notification_status,text,text,integer,text,text,boolean,timestamptz)',
    'execute'
  ),
  false,
  'authenticated clients cannot complete Slack notifications'
);

insert into auth.users (
  id, instance_id, aud, role, email, encrypted_password,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values
  (
    '00000000-0000-4000-8000-000000000501',
    '00000000-0000-0000-0000-000000000000',
    'authenticated', 'authenticated', 'slack-owner@example.com', '',
    '{"provider":"email","providers":["email"]}', '{}',
    pg_catalog.now(), pg_catalog.now()
  ),
  (
    '00000000-0000-4000-8000-000000000502',
    '00000000-0000-0000-0000-000000000000',
    'authenticated', 'authenticated', 'slack-other@example.com', '',
    '{"provider":"email","providers":["email"]}', '{}',
    pg_catalog.now(), pg_catalog.now()
  );

insert into public.job_postings (
  id, owner_id, source, external_id, canonical_url, company_name, title
) values (
  '00000000-0000-4000-8000-000000000503',
  '00000000-0000-4000-8000-000000000501', 'wanted', '384409',
  'https://www.wanted.co.kr/wd/384409', '미리디', 'AX Engineer - Infra'
);

select is(
  (select count(*)::integer from public.slack_notifications
   where job_posting_id = '00000000-0000-4000-8000-000000000503'
     and event_type = 'job_posting_registered'),
  1,
  'a new posting atomically creates one root notification'
);
select is(
  (select status::text from public.slack_job_threads
   where job_posting_id = '00000000-0000-4000-8000-000000000503'),
  'pending',
  'a new posting creates a pending thread record'
);

insert into public.applications (
  id, owner_id, job_posting_id, attempt_number, status
) values (
  '00000000-0000-4000-8000-000000000504',
  '00000000-0000-4000-8000-000000000501',
  '00000000-0000-4000-8000-000000000503', 1, 'interested'
);

select is(
  (select count(*)::integer from public.slack_notifications
   where event_type = 'application_status_changed'),
  0,
  'initial application status history does not create noise'
);

update public.applications set status = 'preparing'
where id = '00000000-0000-4000-8000-000000000504';
select is(
  (select count(*)::integer from public.slack_notifications
   where event_type = 'application_status_changed'),
  1,
  'a real application status transition creates a thread notification'
);

update public.applications set interview_at = '2026-09-20T04:00:00Z'
where id = '00000000-0000-4000-8000-000000000504';
select is(
  (select count(*)::integer from public.slack_notifications
   where event_type = 'interview_scheduled'),
  1,
  'an interview schedule creates a thread notification'
);

insert into public.job_posting_collection_runs (
  id, owner_id, job_posting_id, mode, status, request_id, started_at
) values (
  '00000000-0000-4000-8000-000000000505',
  '00000000-0000-4000-8000-000000000501',
  '00000000-0000-4000-8000-000000000503',
  'automatic', 'running', '00000000-0000-4000-8000-000000000506', pg_catalog.now()
);
update public.job_posting_collection_runs set
  status = 'needs_input', error_code = 'ACCESS_BLOCKED', finished_at = pg_catalog.now()
where id = '00000000-0000-4000-8000-000000000505';
select is(
  (select count(*)::integer from public.slack_notifications
   where event_type = 'collection_needs_input' and target = 'error_channel'),
  1,
  'collection input failures route to the error channel'
);

select is(
  (select count(*)::integer from public.claim_slack_notifications(2)),
  2,
  'one notification per route can be claimed together'
);
select is(
  (select status::text from public.slack_notifications where target = 'job_root'),
  'dispatching',
  'the root notification is claimed before thread replies'
);
select is(
  (select count(*)::integer from public.slack_notifications
   where target = 'job_thread' and status = 'queued'),
  2,
  'thread notifications remain queued while the root is pending'
);
select is(
  (select count(*)::integer from public.claim_slack_notifications(2)),
  0,
  'route serialization rejects concurrent claims'
);

select is(
  (
    select status::text from public.complete_slack_notification(
      (select id from public.slack_notifications where target = 'job_root'),
      (select event_id from public.slack_notifications where target = 'job_root'),
      '00000000-0000-4000-8000-000000000507',
      'sent', 'C0123456789', '1710000000.000001', 200,
      null, null, false, pg_catalog.now()
    )
  ),
  'sent',
  'a successful root callback marks the notification sent'
);
select is(
  (select status::text from public.slack_job_threads
   where job_posting_id = '00000000-0000-4000-8000-000000000503'),
  'ready',
  'a successful root callback makes its thread reusable'
);
select is(
  (select thread_ts from public.slack_job_threads
   where job_posting_id = '00000000-0000-4000-8000-000000000503'),
  '1710000000.000001',
  'the root timestamp is persisted'
);
select is(
  (select http_status from public.slack_notifications where target = 'job_root'),
  200,
  'the Slack HTTP status is persisted'
);

select is(
  (
    select status::text from public.complete_slack_notification(
      (select id from public.slack_notifications where target = 'error_channel'),
      (select event_id from public.slack_notifications where target = 'error_channel'),
      '00000000-0000-4000-8000-000000000508',
      'sent', null, null, 200, null, null, false, pg_catalog.now()
    )
  ),
  'sent',
  'an incoming webhook callback can succeed without a message timestamp'
);

select is(
  (select count(*)::integer from public.claim_slack_notifications(2)),
  1,
  'the first queued thread reply becomes dispatchable after root success'
);
select is(
  (select count(*)::integer from public.claim_slack_notifications(2)),
  0,
  'only one job-channel message is active at a time'
);

select is(
  (
    select status::text from public.complete_slack_notification(
      (select id from public.slack_notifications where target = 'job_thread' and status = 'dispatching'),
      (select event_id from public.slack_notifications where target = 'job_thread' and status = 'dispatching'),
      '00000000-0000-4000-8000-000000000509',
      'sent', 'C0123456789', '1710000001.000001', 200,
      null, null, false, pg_catalog.now()
    )
  ),
  'sent',
  'a thread reply is completed independently of the root'
);
select is(
  (
    select status::text from public.complete_slack_notification(
      (select id from public.slack_notifications where completion_event_id = '00000000-0000-4000-8000-000000000509'),
      (select event_id from public.slack_notifications where completion_event_id = '00000000-0000-4000-8000-000000000509'),
      '00000000-0000-4000-8000-000000000509',
      'sent', 'C0123456789', '1710000001.000001', 200,
      null, null, false, pg_catalog.now()
    )
  ),
  'sent',
  'a duplicate callback event is idempotent'
);

select is(
  (select count(*)::integer from public.claim_slack_notifications(2)),
  1,
  'the next thread notification is claimable after completion'
);
select is(
  (
    select status::text from public.fail_slack_notification_dispatch(
      (select id from public.slack_notifications where target = 'job_thread' and status = 'dispatching'),
      'n8n에서 알림 요청을 받지 못했습니다.',
      true
    )
  ),
  'failed',
  'a known n8n dispatch failure is recorded without changing domain data'
);

update public.applications set status = 'applied'
where id = '00000000-0000-4000-8000-000000000504';
select is(
  (select count(*)::integer from public.claim_slack_notifications(2)),
  1,
  'a later status event can be claimed after a known failure'
);
update public.slack_notifications set dispatched_at = pg_catalog.now() - interval '11 minutes'
where status = 'dispatching';
select is(
  (select count(*)::integer from public.fail_stale_slack_notifications(pg_catalog.now() - interval '10 minutes', 100)),
  1,
  'stale dispatches are detected'
);
select is(
  (select count(*)::integer from public.slack_notifications
   where event_type = 'application_status_changed'
     and status = 'delivery_unknown'),
  1,
  'stale dispatches are not automatically retried'
);

select throws_ok(
  $$insert into public.slack_notifications (
      owner_id, event_id, request_id, dedupe_key, event_type, target,
      route_key, job_posting_id, context
    ) values (
      '00000000-0000-4000-8000-000000000501',
      extensions.gen_random_uuid(), extensions.gen_random_uuid(),
      'job-posting:00000000-0000-4000-8000-000000000503:registered',
      'job_posting_registered', 'job_root', 'job_channel',
      '00000000-0000-4000-8000-000000000503', '{}'
    )$$,
  '23505',
  null,
  'duplicate logical events are rejected'
);
select throws_ok(
  $$update public.slack_job_threads set status = 'ready', channel_id = null
    where job_posting_id = '00000000-0000-4000-8000-000000000503'$$,
  '23514',
  null,
  'ready threads require a channel and root timestamp'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000501', true);
select is(
  (select count(*)::integer from public.slack_notifications),
  5,
  'an owner can read their Slack notification history'
);
select is(
  (select count(*)::integer from public.slack_job_threads),
  1,
  'an owner can read their Slack thread state'
);
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000502', true);
select is(
  (select count(*)::integer from public.slack_notifications),
  0,
  'another user cannot read Slack notifications'
);
select is(
  (select count(*)::integer from public.slack_job_threads),
  0,
  'another user cannot read Slack thread state'
);
select throws_ok(
  $$insert into public.slack_notifications (
      owner_id, event_id, request_id, dedupe_key, event_type, target,
      route_key, job_posting_id, context
    ) values (
      '00000000-0000-4000-8000-000000000501',
      extensions.gen_random_uuid(), extensions.gen_random_uuid(), 'forged',
      'application_status_changed', 'job_thread', 'job_channel',
      '00000000-0000-4000-8000-000000000503', '{}'
    )$$,
  '42501',
  null,
  'authenticated clients cannot insert notification rows'
);

select * from finish();
rollback;
