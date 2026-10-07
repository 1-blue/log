begin;
set local search_path = public, extensions;
select no_plan();
insert into auth.users(id) values('00000000-0000-4000-8000-000000000901'),('00000000-0000-4000-8000-000000000902');
insert into public.document_versions(id,owner_id,document_type,label,original_filename,storage_path,mime_type,file_size,content_hash)
select id,'00000000-0000-4000-8000-000000000901',type::public.document_type,label,'test.pdf',
 '00000000-0000-4000-8000-000000000901/'||type||'/'||id||'.pdf','application/pdf',100,repeat(hash,64)
from (values ('00000000-0000-4000-8000-000000000903'::uuid,'resume','Resume','a'),
 ('00000000-0000-4000-8000-000000000904'::uuid,'portfolio','Portfolio','b'),
 ('00000000-0000-4000-8000-000000000905'::uuid,'portfolio','Replacement','c')) f(id,type,label,hash);

select ok(public.begin_document_extraction('00000000-0000-4000-8000-000000000901','00000000-0000-4000-8000-000000000904','00000000-0000-4000-8000-000000000920'),'first extraction starts');
select ok(not public.begin_document_extraction('00000000-0000-4000-8000-000000000901','00000000-0000-4000-8000-000000000904','00000000-0000-4000-8000-000000000921'),'duplicate extraction does not start');
select ok(not public.finish_document_extraction('00000000-0000-4000-8000-000000000901','00000000-0000-4000-8000-000000000904','00000000-0000-4000-8000-000000000921',repeat('b',64),'old text','','ocr'),'previous attempt cannot overwrite current attempt');
select ok(public.finish_document_extraction('00000000-0000-4000-8000-000000000901','00000000-0000-4000-8000-000000000904','00000000-0000-4000-8000-000000000920',repeat('b',64),'OCR text','','ocr'),'current OCR attempt completes');
select is((select extraction_source from public.document_versions where id='00000000-0000-4000-8000-000000000904'),'ocr','OCR provenance is saved');
select ok(not public.finish_document_extraction('00000000-0000-4000-8000-000000000901','00000000-0000-4000-8000-000000000904','00000000-0000-4000-8000-000000000920',repeat('b',64),'','','OCR_FAILED'),'late failure cannot erase completed text');
select public.begin_document_extraction('00000000-0000-4000-8000-000000000901','00000000-0000-4000-8000-000000000905','00000000-0000-4000-8000-000000000922');
update public.document_versions set extracted_text='manual correction',extraction_status='ready',extraction_source='manual',extraction_event_id=null where id='00000000-0000-4000-8000-000000000905';
select ok(not public.finish_document_extraction('00000000-0000-4000-8000-000000000901','00000000-0000-4000-8000-000000000905','00000000-0000-4000-8000-000000000922',repeat('c',64),'late OCR','','ocr'),'manual text wins over late success');
select is((select extracted_text from public.document_versions where id='00000000-0000-4000-8000-000000000905'),'manual correction','manual correction is preserved');

create temp table fixture as select id as app, job_posting_id as posting from public.create_application_with_posting(
 '00000000-0000-4000-8000-000000000901','wanted','990901','https://www.wanted.co.kr/wd/990901','Test company','FE',
 'interested',null,null,null,'00000000-0000-4000-8000-000000000903','00000000-0000-4000-8000-000000000904');
alter table fixture add column locked uuid;
update fixture set locked=(select id from public.create_application_attempt('00000000-0000-4000-8000-000000000901',posting,'applied',current_date,null,null,
 '00000000-0000-4000-8000-000000000903','00000000-0000-4000-8000-000000000905'));
insert into public.job_posting_snapshots(id,owner_id,job_posting_id,source,raw_content,normalized_content,content_hash,parser_version,source_metadata,fetched_at)
select '00000000-0000-4000-8000-000000000908','00000000-0000-4000-8000-000000000901',posting,'manual','job','job',repeat('d',64),'test-v1','{}',now() from fixture;
insert into public.analysis_jobs(id,owner_id,application_id,job_posting_id,job_posting_snapshot_id,resume_version_id,portfolio_version_id,
 job_posting_text,job_posting_content_hash,resume_text,resume_content_hash,resume_original_length,portfolio_text,portfolio_content_hash,portfolio_original_length,request_id)
select '00000000-0000-4000-8000-000000000909','00000000-0000-4000-8000-000000000901',app,posting,'00000000-0000-4000-8000-000000000908',
 '00000000-0000-4000-8000-000000000903','00000000-0000-4000-8000-000000000904','job',repeat('d',64),'resume',repeat('a',64),6,'portfolio',repeat('b',64),9,'00000000-0000-4000-8000-000000000919' from fixture;
select throws_ok($$select public.set_career_maintenance('00000000-0000-4000-8000-000000000901',true)$$,'P0001','running_jobs','reset refuses running analysis');
update public.analysis_jobs set status='cancelled',finished_at=now() where id='00000000-0000-4000-8000-000000000909';
select public.replace_application_state('00000000-0000-4000-8000-000000000901',app,'interested',null,null,null,
 '00000000-0000-4000-8000-000000000903','00000000-0000-4000-8000-000000000905',false) from fixture;
update public.document_versions set archived_at=now() where id='00000000-0000-4000-8000-000000000904';
select is((public.preview_career_deletion('00000000-0000-4000-8000-000000000901','document','00000000-0000-4000-8000-000000000904')->>'allowed')::boolean,false,'historical analysis blocks document deletion while application is active');
select is(jsonb_array_length(public.preview_career_deletion('00000000-0000-4000-8000-000000000901','document','00000000-0000-4000-8000-000000000904')->'applications'),1,'historical application appears in the preview');
select throws_ok($$select public.preview_career_deletion('00000000-0000-4000-8000-000000000902','document','00000000-0000-4000-8000-000000000904')$$,'P0001','resource_not_found','another owner cannot preview this document');
update public.applications set archived_at=now() where id=(select app from fixture);
create temp table original_preview as select public.preview_career_deletion('00000000-0000-4000-8000-000000000901','document','00000000-0000-4000-8000-000000000904') as data;
update public.applications set note='changed after preview' where id=(select app from fixture);
select throws_ok($$select public.delete_career_resource('00000000-0000-4000-8000-000000000901','document','00000000-0000-4000-8000-000000000904',(select data->>'fingerprint' from original_preview))$$,'P0001','deletion_preview_changed','changed graph must be previewed again');
create temp table deleted_operation as select * from public.delete_career_resource('00000000-0000-4000-8000-000000000901','document','00000000-0000-4000-8000-000000000904',
 public.preview_career_deletion('00000000-0000-4000-8000-000000000901','document','00000000-0000-4000-8000-000000000904')->>'fingerprint');
select is((select count(*)::integer from public.applications where id=(select app from fixture)),0,'referencing archived application is deleted');
select is((select count(*)::integer from public.analysis_jobs where id='00000000-0000-4000-8000-000000000909'),0,'historical analysis is deleted');
select is((select count(*)::integer from public.document_versions where id='00000000-0000-4000-8000-000000000903'),1,'other document is preserved');
select is((select count(*)::integer from public.applications where id=(select locked from fixture)),1,'unrelated submitted application is preserved');
select is((select count(*)::integer from public.job_postings where id=(select posting from fixture)),1,'shared posting is preserved');
select is((select status from deleted_operation),'pending','deletion waits for physical PDF cleanup');
select is((public.delete_career_resource('00000000-0000-4000-8000-000000000901','document','00000000-0000-4000-8000-000000000904',(select fingerprint from deleted_operation))).id,
 (select id from deleted_operation),'repeating deletion returns the same operation');
select throws_ok($$select public.finish_document_extraction('00000000-0000-4000-8000-000000000901','00000000-0000-4000-8000-000000000904','00000000-0000-4000-8000-000000000920',repeat('b',64),'late','','ocr')$$,'P0001','resource_not_found','late callback cannot resurrect a document');
create temp table cleanup_task as select * from public.claim_career_storage_cleanup('00000000-0000-4000-8000-000000000901',20);
select public.finish_career_storage_cleanup('00000000-0000-4000-8000-000000000901',id,attempts,false) from cleanup_task;
select is((select status from public.career_deletion_operations where id=(select id from deleted_operation)),'failed','Storage failure is recorded');
truncate cleanup_task;
insert into cleanup_task select * from public.claim_career_storage_cleanup('00000000-0000-4000-8000-000000000901',20);
select public.finish_career_storage_cleanup('00000000-0000-4000-8000-000000000901',id,attempts,true) from cleanup_task;
select is((select status from public.career_deletion_operations where id=(select id from deleted_operation)),'completed','Storage retry completes the operation');
select throws_ok($$delete from public.application_documents where application_id=(select locked from fixture)$$,'23514','Submitted application documents cannot be changed','normal submitted document deletion is still forbidden');
select throws_ok($$delete from public.job_posting_snapshots where id='00000000-0000-4000-8000-000000000908'$$,'23514','Job posting snapshots are immutable','normal immutable snapshot deletion is still forbidden');
update public.applications set archived_at=now() where id=(select locked from fixture);
select lives_ok($$select public.delete_career_resource('00000000-0000-4000-8000-000000000901','application',(select locked from fixture),public.preview_career_deletion('00000000-0000-4000-8000-000000000901','application',(select locked from fixture))->>'fingerprint')$$,'scoped purge can delete submitted archived applications');
select is((select count(*)::integer from private.career_purge_context),0,'purge permission is cleared after the operation');
select lives_ok($$select public.create_application_attempt('00000000-0000-4000-8000-000000000901',(select posting from fixture),'interested',null,null,null,null,null)$$,'same posting can be reused after deleting the last application');
select ok(public.set_career_maintenance('00000000-0000-4000-8000-000000000901',true),'maintenance lock can be acquired once jobs stop');
select throws_ok($$select public.set_career_maintenance('00000000-0000-4000-8000-000000000901',true)$$,'P0001','maintenance_already_enabled','another reset cannot acquire the existing maintenance lock');
select throws_ok($$update public.document_versions set label='blocked' where id='00000000-0000-4000-8000-000000000903'$$,'P0001','career_ops_maintenance','maintenance blocks new writes');
select throws_ok($$insert into storage.objects(bucket_id,name) values('career-documents','00000000-0000-4000-8000-000000000901/resume/new.pdf')$$,'P0001','career_ops_maintenance','previous upload tokens cannot finalize objects during reset');
select lives_ok($$select public.delete_career_resource('00000000-0000-4000-8000-000000000901','reset',null,public.preview_career_deletion('00000000-0000-4000-8000-000000000901','reset',null)->>'fingerprint')$$,'full reset uses the same constrained purge infrastructure');
select is((select count(*)::integer from public.document_versions where owner_id='00000000-0000-4000-8000-000000000901'),0,'full reset removes documents');
select is((select count(*)::integer from public.job_postings where owner_id='00000000-0000-4000-8000-000000000901'),0,'full reset removes postings and immutable snapshots');
select is((select count(*)::integer from auth.users where id='00000000-0000-4000-8000-000000000901'),1,'reset preserves admin account');
select is((select count(*)::integer from auth.users where id='00000000-0000-4000-8000-000000000902'),1,'reset preserves other owner');
select ok(not has_function_privilege('authenticated','public.delete_career_resource(uuid,text,uuid,text)','execute'),'browser cannot invoke purge RPC directly');
select ok(not has_function_privilege('authenticated','public.set_career_maintenance(uuid,boolean)','execute'),'browser cannot invoke reset lock directly');
select * from finish();
rollback;
