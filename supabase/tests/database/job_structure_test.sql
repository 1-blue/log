begin;
set local search_path=public,extensions;
select no_plan();
select is((select count(*)::integer from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public' and p.proname='create_application_with_posting'),1,
  'legacy RPC has no ambiguous same-argument overload');
select has_function('public','create_application_with_posting_v2',array['uuid','text','text','text','text','text','application_status','date','timestamp with time zone','text','uuid','uuid'],
  'new platform RPC has a separate PostgREST endpoint');
insert into auth.users(id) values('00000000-0000-4000-8000-000000001201');
insert into public.job_postings(id,owner_id,source,external_id,canonical_url,company_name,title)
  values('00000000-0000-4000-8000-000000001202','00000000-0000-4000-8000-000000001201','saramin',repeat('a',64),
    'https://www.saramin.co.kr/zf_user/jobs/relay/view?rec_idx=123','Company','Engineer');
select is((select source from public.job_postings where id='00000000-0000-4000-8000-000000001202'),'saramin','platform text and identity query are supported');
select throws_ok($$insert into public.job_postings(owner_id,source,external_id,canonical_url,company_name,title) values('00000000-0000-4000-8000-000000001201','other','different','https://www.saramin.co.kr/zf_user/jobs/relay/view?rec_idx=123','C','T')$$,'23505',null,'same URL cannot be duplicated through a different platform code');
insert into public.job_posting_collection_runs(id,owner_id,job_posting_id,mode,request_id)
 values('00000000-0000-4000-8000-000000001203','00000000-0000-4000-8000-000000001201','00000000-0000-4000-8000-000000001202','manual','00000000-0000-4000-8000-000000001204');
select throws_ok($$select public.claim_job_structuring('00000000-0000-4000-8000-000000001201','00000000-0000-4000-8000-000000001203','00000000-0000-4000-8000-000000001299','00000000-0000-4000-8000-000000001205',repeat('a',64))$$,'23514',null,'request mismatch cannot claim an AI call');
select throws_ok($$select public.claim_job_structuring('00000000-0000-4000-8000-000000001201','00000000-0000-4000-8000-000000001203','00000000-0000-4000-8000-000000001204',null,null)$$,'23514',null,'a source hash and event are required');
select ok(public.claim_job_structuring('00000000-0000-4000-8000-000000001201','00000000-0000-4000-8000-000000001203','00000000-0000-4000-8000-000000001204','00000000-0000-4000-8000-000000001205',encode(extensions.digest('source','sha256'),'hex')),'one transport callback claims exactly one AI dispatch');
select ok(not public.claim_job_structuring('00000000-0000-4000-8000-000000001201','00000000-0000-4000-8000-000000001203','00000000-0000-4000-8000-000000001204','00000000-0000-4000-8000-000000001206',repeat('b',64)),'duplicate transport does not dispatch another billable call');
select throws_ok($$select public.complete_job_posting_collection_v3('00000000-0000-4000-8000-000000001203','00000000-0000-4000-8000-000000001201','00000000-0000-4000-8000-000000001206','needs_input','AI_STRUCTURING_FAILED')$$,'23514',null,'an old AI failure cannot settle a newer request');
select throws_ok($$select public.complete_job_posting_collection_v3('00000000-0000-4000-8000-000000001203','00000000-0000-4000-8000-000000001201','00000000-0000-4000-8000-000000001205','succeeded')$$,'23514',null,'an empty success cannot be saved');
create function pg_temp.finish_structure(run uuid,event uuid,content text default 'source',prompt text default 'job-structure-v2')
returns public.job_posting_collection_runs language sql as $$
  select public.complete_job_posting_collection_v3(run,'00000000-0000-4000-8000-000000001201',event,'succeeded',
    null,false,200,'ai',content,'Company\nEngineer\n'||content,repeat('d',64),'job-structure-v2',
    '{"title":"Engineer","companyName":"Company"}',now(),'{"requirements":"Skill"}','{"title":"Engineer","requirements":[]}',
    'job-structure-v2','gpt-5.6-luna',prompt);
$$;
select throws_ok($$select pg_temp.finish_structure('00000000-0000-4000-8000-000000001203','00000000-0000-4000-8000-000000001205','changed source')$$,'23514',null,'a callback cannot substitute its source');
select lives_ok($$select pg_temp.finish_structure('00000000-0000-4000-8000-000000001203','00000000-0000-4000-8000-000000001205')$$,'facts and displayed sections are committed in the same snapshot');
select is((select structure_version from public.job_posting_snapshots where owner_id='00000000-0000-4000-8000-000000001201'),'job-structure-v2','snapshot records structure identity');
select is((select status::text from public.job_posting_collection_runs where id='00000000-0000-4000-8000-000000001203'),'succeeded','run becomes terminal only with validated structure');
select lives_ok($$select pg_temp.finish_structure('00000000-0000-4000-8000-000000001203','00000000-0000-4000-8000-000000001205')$$,'same final callback is idempotent');
select throws_ok($$update public.job_posting_snapshots set structured_facts='{}' where owner_id='00000000-0000-4000-8000-000000001201'$$,'23514',null,'cached facts remain immutable');
insert into public.job_posting_collection_runs(id,owner_id,job_posting_id,mode,request_id)
 values('00000000-0000-4000-8000-000000001207','00000000-0000-4000-8000-000000001201','00000000-0000-4000-8000-000000001202','manual','00000000-0000-4000-8000-000000001208');
select public.claim_job_structuring('00000000-0000-4000-8000-000000001201','00000000-0000-4000-8000-000000001207','00000000-0000-4000-8000-000000001208','00000000-0000-4000-8000-000000001209',encode(extensions.digest('source','sha256'),'hex'));
select throws_ok($$select pg_temp.finish_structure('00000000-0000-4000-8000-000000001207','00000000-0000-4000-8000-000000001209','source','changed-prompt')$$,'23514',null,'a hash collision with a different prompt cannot reuse cache');
select lives_ok($$select pg_temp.finish_structure('00000000-0000-4000-8000-000000001207','00000000-0000-4000-8000-000000001209')$$,'same source and versions reuse an immutable snapshot');
select is((select count(*)::integer from public.job_posting_snapshots where owner_id='00000000-0000-4000-8000-000000001201'),1,'cache reuse does not duplicate snapshots');
select ok(not has_function_privilege('authenticated','public.claim_job_structuring(uuid,uuid,uuid,uuid,text)','execute'),'browser cannot claim AI jobs directly');
select * from finish();
rollback;
