begin;
set local search_path=public,extensions;
select no_plan();
insert into auth.users(id) values ('00000000-0000-4000-8000-000000001001'),('00000000-0000-4000-8000-000000001002');
insert into public.document_versions(id,owner_id,document_type,label,original_filename,storage_path,mime_type,file_size,content_hash)
values ('00000000-0000-4000-8000-000000001003','00000000-0000-4000-8000-000000001001','resume','Resume','resume.pdf',
 '00000000-0000-4000-8000-000000001001/resume/00000000-0000-4000-8000-000000001003.pdf','application/pdf',100,repeat('a',64));
select is((select count(*)::integer from public.slack_notifications where event_type='document_uploaded'),1,'registration atomically enqueues upload receipt');
select is((select job_posting_id from public.slack_notifications where event_type='document_uploaded'),null::uuid,'document notification needs no posting');
select is((select target::text from public.claim_slack_notifications(1)),'document','document receipt can be claimed independently of job threads');
select public.mark_slack_dispatch_unknown(id) from public.slack_notifications;
create temp table original as select * from public.slack_notifications;
select throws_ok($$select public.retry_slack_notification('00000000-0000-4000-8000-000000001001',(select id from original),(select updated_at from original),false)$$,'23514',
 'Slack retry requires a failed delivery or explicit unknown-delivery confirmation','ambiguous delivery is not automatically retried');
select throws_ok($$select public.retry_slack_notification('00000000-0000-4000-8000-000000001002',(select id from original),(select updated_at from original),true)$$,'P0002','Slack notification not found','another owner cannot retry');
select public.retry_slack_notification('00000000-0000-4000-8000-000000001001',id,updated_at,true) from original;
select isnt((select event_id from public.slack_notifications),(select event_id from original),'retry gets a new event identity');
select throws_ok($$select public.complete_slack_notification((select id from original),(select event_id from original),gen_random_uuid(),'sent','C123456','1710000000.000001',200,null,null,false)$$,
 '23514','Slack notification event ID does not match','late callback cannot settle the next delivery');
select public.claim_slack_notifications(1);
select public.complete_slack_notification(id,event_id,gen_random_uuid(),'sent','C123456','1710000000.000001',200,null,null,false) from public.slack_notifications;
select throws_ok($$select public.retry_slack_notification('00000000-0000-4000-8000-000000001001',(select id from original),(select updated_at from public.slack_notifications),false)$$,
 '23514','Slack retry requires a failed delivery or explicit unknown-delivery confirmation','sent messages cannot be resent');
select public.begin_document_extraction('00000000-0000-4000-8000-000000001001','00000000-0000-4000-8000-000000001003','00000000-0000-4000-8000-000000001004');
select public.finish_document_extraction('00000000-0000-4000-8000-000000001001','00000000-0000-4000-8000-000000001003','00000000-0000-4000-8000-000000001004',repeat('a',64),'OCR text','','ocr');
select public.finish_document_extraction('00000000-0000-4000-8000-000000001001','00000000-0000-4000-8000-000000001003','00000000-0000-4000-8000-000000001004',repeat('a',64),'OCR text','','ocr');
select is((select count(*)::integer from public.slack_notifications where event_type='document_extraction_succeeded'),1,'repeated completion enqueues only one OCR message');
select public.begin_document_extraction('00000000-0000-4000-8000-000000001001','00000000-0000-4000-8000-000000001003','00000000-0000-4000-8000-000000001005');
-- Ready documents cannot be restarted by begin_document_extraction; use a separate fixture
-- to exercise failure without changing the production extraction locking rules.
insert into public.document_versions(id,owner_id,document_type,label,original_filename,storage_path,mime_type,file_size,content_hash)
values ('00000000-0000-4000-8000-000000001006','00000000-0000-4000-8000-000000001001','portfolio','Portfolio','portfolio.pdf',
 '00000000-0000-4000-8000-000000001001/portfolio/00000000-0000-4000-8000-000000001006.pdf','application/pdf',100,repeat('b',64));
select public.begin_document_extraction('00000000-0000-4000-8000-000000001001','00000000-0000-4000-8000-000000001006','00000000-0000-4000-8000-000000001007');
select public.finish_document_extraction('00000000-0000-4000-8000-000000001001','00000000-0000-4000-8000-000000001006','00000000-0000-4000-8000-000000001007',repeat('b',64),'','private failure detail','ocr');
select is((select count(*)::integer from public.slack_notifications where event_type='document_extraction_failed'),1,'OCR failure atomically enqueues safe failure notification');
select ok(not exists(select 1 from public.slack_notifications where context::text like '%private failure%'),'notification does not include provider error text');
select is((select count(*)::integer from public.slack_notifications where job_posting_id is not null),0,'document lifecycle never creates a synthetic job posting');
update public.document_versions set archived_at=now() where id='00000000-0000-4000-8000-000000001003';
select is((public.preview_career_deletion('00000000-0000-4000-8000-000000001001','document','00000000-0000-4000-8000-000000001003')->'counts'->>'slack_notifications')::integer,2,'document deletion includes its notification history');
update public.slack_notifications set not_before=now()+interval '1 day' where document_version_id='00000000-0000-4000-8000-000000001006';
select public.claim_slack_notifications(1);
select ok(not (public.preview_career_deletion('00000000-0000-4000-8000-000000001001','document','00000000-0000-4000-8000-000000001003')->>'allowed')::boolean,'in-flight document message blocks deletion');
select public.mark_slack_dispatch_unknown(id) from public.slack_notifications where status='dispatching';
select public.delete_career_resource('00000000-0000-4000-8000-000000001001','document','00000000-0000-4000-8000-000000001003',
 public.preview_career_deletion('00000000-0000-4000-8000-000000001001','document','00000000-0000-4000-8000-000000001003')->>'fingerprint');
select is((select count(*)::integer from public.slack_notifications where document_version_id='00000000-0000-4000-8000-000000001003'),0,'scoped document purge removes its outbox messages');
select is((select count(*)::integer from public.document_versions where id='00000000-0000-4000-8000-000000001006'),1,'other document stays intact');
select ok(not has_function_privilege('authenticated','public.retry_slack_notification(uuid,uuid,timestamptz,boolean)','execute'),'browser cannot bypass admin retry API');
insert into public.job_postings(id,owner_id,source,external_id,canonical_url,company_name,title) values
 ('00000000-0000-4000-8000-000000001008','00000000-0000-4000-8000-000000001001','wanted','991008','https://www.wanted.co.kr/wd/991008','Company','Engineer');
insert into public.applications(id,owner_id,job_posting_id,attempt_number,status) values
 ('00000000-0000-4000-8000-000000001009','00000000-0000-4000-8000-000000001001','00000000-0000-4000-8000-000000001008',1,'interested');
update public.applications set status='preparing' where id='00000000-0000-4000-8000-000000001009';
select public.claim_slack_notifications(1);
select public.fail_slack_notification_dispatch(id,'Slack dispatch rejected',false) from public.slack_notifications where target='job_root';
select is((select count(*)::integer from public.claim_slack_notifications(1)),0,'failed root holds its pending replies');
select public.retry_slack_notification(owner_id,id,updated_at,false) from public.slack_notifications where target='job_root';
select is((select status::text from public.slack_job_threads),'pending','retry resets failed thread to pending');
select public.claim_slack_notifications(1);
select public.complete_slack_notification(id,event_id,gen_random_uuid(),'sent','C123456','1710000000.000002',200,null,null,false) from public.slack_notifications where target='job_root';
select is((select status::text from public.slack_job_threads),'ready','successful root retry repairs the thread');
select is((select target::text from public.claim_slack_notifications(1)),'job_thread','repaired root unblocks previously queued reply');
select * from finish();
rollback;
