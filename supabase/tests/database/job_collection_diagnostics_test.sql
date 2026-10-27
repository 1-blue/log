begin;
set local search_path = public, extensions;
select no_plan();

insert into auth.users(id) values ('00000000-0000-4000-8000-000000002701');
insert into public.job_postings(id, owner_id, source, external_id, canonical_url, company_name, title)
values ('00000000-0000-4000-8000-000000002702', '00000000-0000-4000-8000-000000002701',
  'saramin', repeat('e',64), 'https://www.saramin.co.kr/zf_user/jobs/relay/view?rec_idx=27', 'Company', 'Engineer');

select lives_ok($$
do $test$
declare code text; run_id uuid; event_id uuid;
begin
  foreach code in array array['SOURCE_TEXT_EMPTY','SOURCE_NOT_JOB_POSTING','AI_RESPONSE_INVALID',
    'AI_EVIDENCE_MISMATCH','AI_SOURCE_MISMATCH','AI_METADATA_MISMATCH','AI_TIMEOUT','AI_RATE_LIMITED',
    'AI_AUTHENTICATION_FAILED','AI_BILLING_LIMIT','AI_SERVICE_UNAVAILABLE'] loop
    run_id := gen_random_uuid(); event_id := gen_random_uuid();
    insert into public.job_posting_collection_runs(id,owner_id,job_posting_id,mode,request_id)
      values(run_id,'00000000-0000-4000-8000-000000002701','00000000-0000-4000-8000-000000002702','manual',gen_random_uuid());
    perform public.complete_job_posting_collection_v3(run_id,'00000000-0000-4000-8000-000000002701',event_id,
      (case when code like 'AI_%' then 'failed' else 'needs_input' end)::public.job_posting_collection_status,
      code::public.job_posting_collection_error_code,code in ('AI_TIMEOUT','AI_RATE_LIMITED','AI_SERVICE_UNAVAILABLE'));
  end loop;
end;
$test$;
$$, 'all new safe failure codes can settle real DB runs');
select is((select count(*)::integer from public.job_posting_collection_runs where owner_id='00000000-0000-4000-8000-000000002701' and status='failed'),9,'AI failures do not ask the user to supply missing job sections');
select is((select count(*)::integer from public.job_posting_collection_runs where owner_id='00000000-0000-4000-8000-000000002701' and status='needs_input'),2,'only unusable source requires new input');
select is((select count(*)::integer from public.job_posting_collection_runs where owner_id='00000000-0000-4000-8000-000000002701' and retryable),3,'only transient provider failures are marked retryable');

insert into public.job_posting_collection_runs(id,owner_id,job_posting_id,mode,request_id)
values('00000000-0000-4000-8000-000000002703','00000000-0000-4000-8000-000000002701',
  '00000000-0000-4000-8000-000000002702','manual','00000000-0000-4000-8000-000000002704');
select public.claim_job_structuring('00000000-0000-4000-8000-000000002701','00000000-0000-4000-8000-000000002703',
  '00000000-0000-4000-8000-000000002704','00000000-0000-4000-8000-000000002705',encode(extensions.digest('Engineer hiring','sha256'),'hex'));
select lives_ok($$
select public.complete_job_posting_collection_v3(
  p_collection_run_id => '00000000-0000-4000-8000-000000002703',p_owner_id => '00000000-0000-4000-8000-000000002701',
  p_event_id => '00000000-0000-4000-8000-000000002705',p_status => 'succeeded',p_snapshot_source => 'ai',
  p_raw_content => 'Engineer hiring',p_normalized_content => 'Engineer hiring',p_content_hash => repeat('f',64),
  p_parser_version => 'job-structure-v2',p_source_metadata => '{"title":null,"companyName":null}',p_fetched_at => now(),
  p_sections => '{"mainResponsibilities":null,"requirements":null}',
  p_structured_facts => '{"requirements":[],"warnings":["No requirements; score unavailable"]}',
  p_structure_version => 'job-structure-v2',p_structure_model => 'gpt-5.6-luna',p_structure_prompt_version => 'job-structure-v2-optional-fields-v1');
$$, 'a short sparse posting commits with null sections and explicit warnings');
select is((select structured_facts->'requirements' from public.job_posting_snapshots where owner_id='00000000-0000-4000-8000-000000002701'),'[]'::jsonb,'no requirement is invented by persistence');
select is((select structured_facts->'warnings'->>0 from public.job_posting_snapshots where owner_id='00000000-0000-4000-8000-000000002701'),'No requirements; score unavailable','warnings survive the snapshot transaction');
select is((select sections->'requirements' from public.job_posting_snapshots where owner_id='00000000-0000-4000-8000-000000002701'),'null'::jsonb,'an absent qualification remains unknown');
select * from finish();
rollback;
