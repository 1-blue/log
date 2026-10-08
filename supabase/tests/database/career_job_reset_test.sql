begin;
set local search_path = public, extensions;
select no_plan();
insert into auth.users(id) values ('00000000-0000-4000-8000-000000001101'), ('00000000-0000-4000-8000-000000001102');
insert into public.document_versions(id, owner_id, document_type, label, original_filename, storage_path, mime_type, file_size, content_hash,
  extraction_status, extracted_text, extraction_source, is_default)
values ('00000000-0000-4000-8000-000000001103','00000000-0000-4000-8000-000000001101','resume','Resume','resume.pdf',
  '00000000-0000-4000-8000-000000001101/resume/00000000-0000-4000-8000-000000001103.pdf','application/pdf',100,repeat('a',64),'ready','Preserved OCR','ocr',true),
  ('00000000-0000-4000-8000-000000001104','00000000-0000-4000-8000-000000001101','portfolio','Portfolio','portfolio.pdf',
  '00000000-0000-4000-8000-000000001101/portfolio/00000000-0000-4000-8000-000000001104.pdf','application/pdf',100,repeat('b',64),'ready','Portfolio OCR','ocr',true);
insert into public.document_analysis_profiles(owner_id,document_version_id,document_type,source,status,input_hash,profile,prompt_version)
  values('00000000-0000-4000-8000-000000001101','00000000-0000-4000-8000-000000001103','resume','ai','succeeded',repeat('a',64),'{}','test-v1');
insert into public.ai_balance_baselines(owner_id,balance_usd,recorded_at)
  values('00000000-0000-4000-8000-000000001101',5,now());
insert into public.ai_usage_calls(call_id,owner_id,request_id,operation,resource_id,model,status,attempt,run_attempt,started_at,finished_at)
  values(gen_random_uuid(),'00000000-0000-4000-8000-000000001101',gen_random_uuid(),'document_ocr',
  '00000000-0000-4000-8000-000000001103','gpt-5.6-luna','failed',1,1,now(),now());
create temp table job_fixture as select id as application,job_posting_id as posting from public.create_application_with_posting(
  '00000000-0000-4000-8000-000000001101','wanted','991101','https://www.wanted.co.kr/wd/991101','Company','Engineer','applied',current_date,null,null,
  '00000000-0000-4000-8000-000000001103','00000000-0000-4000-8000-000000001104');
insert into public.job_postings(owner_id,source,external_id,canonical_url,company_name,title)
  values('00000000-0000-4000-8000-000000001102','wanted','991102','https://www.wanted.co.kr/wd/991102','Other company','Engineer');
insert into public.job_posting_snapshots(owner_id,job_posting_id,source,raw_content,normalized_content,content_hash,parser_version,source_metadata,fetched_at)
  select '00000000-0000-4000-8000-000000001101',posting,'manual','job','job',repeat('c',64),'test-v1','{}',now() from job_fixture;
insert into public.api_idempotency_records(owner_id,idempotency_key,request_fingerprint,request_method,request_path,execution_id,original_request_id)
  select '00000000-0000-4000-8000-000000001101',gen_random_uuid(),repeat('d',64),'POST',path,gen_random_uuid(),gen_random_uuid()
  from (values('/v1/applications'),('/v1/document-versions')) f(path);
create temp table saved as select public.preview_career_job_reset('00000000-0000-4000-8000-000000001101') as data;
select ok(not ((select data->'counts' from saved) ? 'document_versions'),'document rows never enter the deletion graph');
select is(((select data->'counts'->>'slack_notifications' from saved))::integer,1,'only job notifications enter the graph');
select throws_ok($$select public.reset_career_job_data('00000000-0000-4000-8000-000000001101',(select data->>'fingerprint' from saved))$$,
  'P0001','maintenance_required','a preview does not authorize an unlocked reset');
update public.document_versions set label='Changed before lock' where id='00000000-0000-4000-8000-000000001103';
select public.set_career_maintenance('00000000-0000-4000-8000-000000001101',true);
select throws_ok($$select public.reset_career_job_data('00000000-0000-4000-8000-000000001101',(select data->>'fingerprint' from saved))$$,
  'P0001','deletion_preview_changed','even preserved-data changes invalidate the old preview');
update saved set data=public.preview_career_job_reset('00000000-0000-4000-8000-000000001101');
create temp table operation as select * from public.reset_career_job_data('00000000-0000-4000-8000-000000001101',(select data->>'fingerprint' from saved));
select is((select status from operation),'completed','no PDF cleanup is needed for a partial reset');
select is((select count(*)::integer from public.applications where owner_id='00000000-0000-4000-8000-000000001101'),0,'submitted application and document selections can be purged through this constrained path');
select is((select count(*)::integer from public.job_postings where owner_id='00000000-0000-4000-8000-000000001101'),0,'job postings and immutable snapshots are deleted');
select is((select count(*)::integer from public.document_versions where owner_id='00000000-0000-4000-8000-000000001101'),2,'document versions are preserved');
select is((select extracted_text from public.document_versions where id='00000000-0000-4000-8000-000000001103'),'Preserved OCR','OCR text is unchanged');
select is((select count(*)::integer from public.document_analysis_profiles where owner_id='00000000-0000-4000-8000-000000001101'),1,'document profiles are preserved');
select is((select count(*)::integer from public.ai_usage_calls where owner_id='00000000-0000-4000-8000-000000001101'),1,'incurred AI costs are preserved');
select is((select balance_usd::text from public.ai_balance_baselines where owner_id='00000000-0000-4000-8000-000000001101'),'5.000000','balance baseline is preserved');
select is((select count(*)::integer from public.slack_notifications where owner_id='00000000-0000-4000-8000-000000001101'),2,'document upload notifications are preserved');
select is((select count(*)::integer from public.api_idempotency_records where owner_id='00000000-0000-4000-8000-000000001101'),1,'document idempotency is preserved, deleted-resource idempotency is removed');
select is((select count(*)::integer from public.career_storage_cleanup where operation_id=(select id from operation)),0,'partial reset cannot enqueue PDF deletion');
select is(public.preview_career_job_reset('00000000-0000-4000-8000-000000001101')->>'preservedFingerprint',(select data->>'preservedFingerprint' from saved),'all preservation fields remain byte-equivalent');
select is((public.reset_career_job_data('00000000-0000-4000-8000-000000001101',(select fingerprint from operation))).id,(select id from operation),'repeating the operation is idempotent');
select is((select count(*)::integer from public.job_postings where owner_id='00000000-0000-4000-8000-000000001102'),1,'another owner is untouched');
select is((select count(*)::integer from private.career_purge_context),0,'scoped purge permission is cleared');
select ok(not has_function_privilege('authenticated','public.reset_career_job_data(uuid,text)','execute'),'browser cannot call partial reset directly');
select public.set_career_maintenance('00000000-0000-4000-8000-000000001101',false);
select * from finish();
rollback;
