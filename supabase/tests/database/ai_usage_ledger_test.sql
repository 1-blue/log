begin;
set local search_path = public, extensions;
select no_plan();
insert into auth.users(id) values('00000000-0000-4000-8000-000000000981'),('00000000-0000-4000-8000-000000000982');
insert into public.document_versions(id,owner_id,document_type,label,original_filename,storage_path,mime_type,file_size,content_hash)
values('00000000-0000-4000-8000-000000000983','00000000-0000-4000-8000-000000000981','resume','Test','test.pdf',
'00000000-0000-4000-8000-000000000981/resume/00000000-0000-4000-8000-000000000983.pdf','application/pdf',100,repeat('a',64));
create temp table call_fixture as select jsonb_build_object(
 'callId','00000000-0000-4000-8000-000000000984','requestId','00000000-0000-4000-8000-000000000985',
 'operation','document_ocr','resourceId','00000000-0000-4000-8000-000000000983','model','gpt-5.6-luna',
 'status','started','attempt',1,'runAttempt',1,'occurredAt','2026-10-07T01:00:00Z') as data;
select lives_ok($$select public.record_ai_usage('00000000-0000-4000-8000-000000000981',(select data from call_fixture))$$,'start is durable before a billable call');
select is((select estimated_cost_usd from public.ai_usage_calls where call_id='00000000-0000-4000-8000-000000000984'),null::numeric,'missing usage is unpriced, not zero');
select lives_ok($$select public.record_ai_usage('00000000-0000-4000-8000-000000000981',(select data from call_fixture))$$,'start delivery is idempotent');
select is((select count(*)::integer from public.ai_usage_calls),1,'duplicate start does not create another call');
select throws_ok($$select public.record_ai_usage('00000000-0000-4000-8000-000000000982',(select data from call_fixture))$$,'23514','ai_usage_identity_conflict','other owner cannot settle a call');
update call_fixture set data=data||jsonb_build_object('status','failed','usage',jsonb_build_object('inputTokens',100,'outputTokens',10,'cachedInputTokens',0,'cacheWriteTokens',0),'estimatedCostUsd',0.000032,'pricingVersion','fixture','responseId','resp_fixture','latencyMs',100,'occurredAt','2026-10-07T01:01:00Z');
select lives_ok($$select public.record_ai_usage('00000000-0000-4000-8000-000000000981',(select data from call_fixture))$$,'failed/incomplete provider responses can still have billable usage');
select is((select status from public.ai_usage_calls),'failed','settlement status is preserved');
select lives_ok($$select public.record_ai_usage('00000000-0000-4000-8000-000000000981',(select data||jsonb_build_object('estimatedCostUsd',99) from call_fixture))$$,'replayed callback is accepted');
select is((select estimated_cost_usd from public.ai_usage_calls),0.000032::numeric,'replay cannot reprice an already settled call');
select throws_ok($$select public.record_ai_usage('00000000-0000-4000-8000-000000000981',(select data||jsonb_build_object('callId','00000000-0000-4000-8000-000000000986','status','started','resourceId','00000000-0000-4000-8000-000000000999') from call_fixture))$$,'P0002','ai_usage_resource_not_found','late callbacks cannot create calls for deleted resources');
select ok(not has_function_privilege('authenticated','public.record_ai_usage(uuid,jsonb)','execute'),'browser cannot write cost records directly');
select ok(not has_table_privilege('authenticated','public.ai_usage_calls','insert'),'browser cannot insert arbitrary cost records');
select ok(not has_table_privilege('anon','public.ai_balance_baselines','select'),'balance is private');
insert into public.career_ops_maintenance(owner_id,enabled) values('00000000-0000-4000-8000-000000000981',true);
select throws_ok($$select public.record_ai_usage('00000000-0000-4000-8000-000000000981',(select data from call_fixture))$$,'23514','career_ops_maintenance','maintenance blocks new accounting writes');
select * from finish();
rollback;
