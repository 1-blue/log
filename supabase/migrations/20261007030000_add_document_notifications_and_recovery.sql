alter table public.slack_notifications alter column job_posting_id drop not null;
alter table public.slack_notifications add column document_version_id uuid;
alter table public.document_versions add constraint document_versions_id_owner_key unique(id,owner_id);
alter table public.slack_notifications add constraint slack_notifications_document_fk
  foreign key (document_version_id, owner_id) references public.document_versions(id, owner_id) on delete restrict;
alter table public.slack_notifications add constraint slack_notifications_resource_check check (
  (target = 'document' and document_version_id is not null and job_posting_id is null
    and application_id is null and analysis_job_id is null and collection_run_id is null)
  or (target <> 'document' and job_posting_id is not null and document_version_id is null)
);
create index slack_notifications_document_idx on public.slack_notifications(document_version_id)
  where document_version_id is not null;

-- Registration happens only after the PDF object and content hash have been checked.
-- OCR completion is written atomically with its notification; manual edits do not emit OCR events.
create function private.enqueue_document_slack() returns trigger
language plpgsql security definer set search_path = '' as $$
declare event_type public.slack_notification_event_type; dedupe text;
begin
  if tg_op = 'INSERT' then
    event_type := 'document_uploaded'; dedupe := 'document:' || new.id || ':uploaded';
  elsif new.extraction_status is distinct from old.extraction_status
    and old.extraction_status = 'processing' and new.extraction_status in ('ready','failed')
    and new.extraction_event_id is not null then
    event_type := case when new.extraction_status = 'ready' then 'document_extraction_succeeded'::public.slack_notification_event_type
      else 'document_extraction_failed'::public.slack_notification_event_type end;
    dedupe := 'document:' || new.id || ':extract:' || new.extraction_event_id;
  else return new;
  end if;
  insert into public.slack_notifications(owner_id,event_id,request_id,dedupe_key,event_type,target,route_key,document_version_id,context)
  values (new.owner_id,extensions.gen_random_uuid(),extensions.gen_random_uuid(),dedupe,event_type,'document','job_channel',new.id,
    jsonb_strip_nulls(jsonb_build_object('label',new.label,'documentType',new.document_type,
      'extractionSource',new.extraction_source,'errorCode',case when new.extraction_status='failed' then 'DOCUMENT_EXTRACTION_FAILED' else null end)))
  on conflict (owner_id,dedupe_key) do nothing;
  return new;
end;
$$;
create trigger document_versions_enqueue_slack after insert or update on public.document_versions
  for each row execute function private.enqueue_document_slack();

-- Retry requires the exact state the administrator inspected. A new dispatch event
-- prevents a late callback from a previous delivery attempt from settling the retry.
create function public.retry_slack_notification(p_owner_id uuid,p_notification_id uuid,p_expected_updated_at timestamptz,
  p_confirm_unknown boolean default false) returns public.slack_notifications
language plpgsql security definer set search_path = '' as $$
declare notification public.slack_notifications;
begin
  perform pg_advisory_xact_lock(hashtextextended(p_owner_id::text,610063));
  select * into notification from public.slack_notifications
    where owner_id=p_owner_id and id=p_notification_id for update;
  if not found then raise exception using errcode='P0002',message='Slack notification not found'; end if;
  if notification.updated_at is distinct from p_expected_updated_at then
    raise exception using errcode='23514',message='Slack notification changed'; end if;
  if notification.status not in ('failed','delivery_unknown') or
    (notification.status='delivery_unknown' and not p_confirm_unknown) then
    raise exception using errcode='23514',message='Slack retry requires a failed delivery or explicit unknown-delivery confirmation'; end if;
  update public.slack_notifications set status='queued',event_id=extensions.gen_random_uuid(),
    attempt_count=0,not_before=now(),channel_id=null,message_ts=null,http_status=null,completion_event_id=null,
    error_code=null,error_message=null,error_retryable=false,dispatched_at=null,finished_at=null
    where id=notification.id returning * into notification;
  if notification.target='job_root' then
    update public.slack_job_threads set status='pending',channel_id=null,thread_ts=null where root_notification_id=notification.id;
  end if;
  return notification;
end;
$$;
revoke all on function public.retry_slack_notification(uuid,uuid,timestamptz,boolean) from public,anon,authenticated;
grant execute on function public.retry_slack_notification(uuid,uuid,timestamptz,boolean) to service_role;

-- Ambiguous n8n acceptance is not proof that Slack did not receive the message.
create function public.mark_slack_dispatch_unknown(p_notification_id uuid) returns public.slack_notifications
language plpgsql security definer set search_path = '' as $$
declare notification public.slack_notifications;
begin
  update public.slack_notifications set status='delivery_unknown',error_code='SLACK_DELIVERY_UNKNOWN',
    error_message='전달 결과를 확인할 수 없습니다. Slack에서 기존 메시지를 확인한 뒤 재전송하세요.',
    error_retryable=false,finished_at=now()
    where id=p_notification_id and status='dispatching' returning * into notification;
  if not found then
    select * into notification from public.slack_notifications where id=p_notification_id;
    if not found then raise exception using errcode='P0002',message='Slack notification not found'; end if;
    return notification; -- A fast callback may already have settled this delivery.
  end if;
  if notification.target='job_root' then
    update public.slack_job_threads set status='delivery_unknown' where root_notification_id=notification.id;
  end if;
  return notification;
end;
$$;
revoke all on function public.mark_slack_dispatch_unknown(uuid) from public,anon,authenticated;
grant execute on function public.mark_slack_dispatch_unknown(uuid) to service_role;

-- Extend the existing transactionally fingerprinted deletion graph, including
-- running document notifications in the blockers. Do not change old migrations.
alter function private.career_deletion_graph(uuid,text,uuid) rename to career_deletion_graph_before_document_notifications;
create function private.career_deletion_graph(p_owner uuid,p_type text,p_id uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare graph jsonb; notifications jsonb; blockers jsonb;
begin
  graph := private.career_deletion_graph_before_document_notifications(p_owner,p_type,p_id);
  if p_type <> 'document' then return graph; end if;
  select coalesce(jsonb_agg(to_jsonb(n) order by to_jsonb(n)::text),'[]') into notifications
    from public.slack_notifications n where n.owner_id=p_owner and
      (n.document_version_id=p_id or n.id in (select (x->>'id')::uuid from jsonb_array_elements(graph->'rows'->'slack_notifications') x));
  blockers := graph->'blockers';
  select blockers || coalesce(jsonb_agg(jsonb_build_object('id',n.id,'label','Slack 전송 중','reason','running_job') order by n.id),'[]')
    into blockers from public.slack_notifications n where n.owner_id=p_owner and n.document_version_id=p_id and n.status='dispatching';
  graph := jsonb_set(graph,'{rows,slack_notifications}',notifications);
  graph := jsonb_set(graph,'{counts,slack_notifications}',to_jsonb(jsonb_array_length(notifications)));
  return graph || jsonb_build_object('blockers',blockers,'allowed',jsonb_array_length(blockers)=0,
    'fingerprint',encode(extensions.digest(((graph->'rows')::text || blockers::text),'sha256'),'hex'));
end;
$$;
revoke all on function private.enqueue_document_slack() from public,anon,authenticated;
revoke all on function private.career_deletion_graph(uuid,text,uuid) from public,anon,authenticated;
