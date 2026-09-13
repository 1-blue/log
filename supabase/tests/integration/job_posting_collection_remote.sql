begin;

insert into auth.users (
  id, instance_id, aud, role, email, encrypted_password,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values (
  '00000000-0000-4000-8000-000000000131',
  '00000000-0000-0000-0000-000000000000',
  'authenticated', 'authenticated', 'collection-integration@example.com', '',
  '{"provider":"email","providers":["email"]}', '{}',
  pg_catalog.now(), pg_catalog.now()
) on conflict (id) do nothing;

insert into public.job_postings (
  id, owner_id, source, external_id, canonical_url, company_name, title
) values (
  '00000000-0000-4000-8000-000000000132',
  '00000000-0000-4000-8000-000000000131',
  'wanted', '384409', 'https://www.wanted.co.kr/wd/384409',
  '미리디', 'AX Engineer - Infra'
);

insert into public.job_posting_collection_runs (
  id, owner_id, job_posting_id, mode, request_id
) values (
  '00000000-0000-4000-8000-000000000133',
  '00000000-0000-4000-8000-000000000131',
  '00000000-0000-4000-8000-000000000132',
  'automatic', '00000000-0000-4000-8000-000000000134'
);

do $$
begin
  begin
    insert into public.job_posting_collection_runs (
      owner_id, job_posting_id, mode, request_id
    ) values (
      '00000000-0000-4000-8000-000000000131',
      '00000000-0000-4000-8000-000000000132',
      'automatic', '00000000-0000-4000-8000-000000000135'
    );
    raise exception 'concurrent collection was accepted';
  exception when unique_violation then null;
  end;
end;
$$;

select public.complete_job_posting_collection(
  '00000000-0000-4000-8000-000000000133',
  '00000000-0000-4000-8000-000000000131',
  '00000000-0000-4000-8000-000000000136',
  'succeeded', null, false, 200, 'wanted_json_ld',
  '주요 업무와 자격 요건이 포함된 충분한 길이의 공고 원문입니다.',
  '회사명: 미리디\n공고명: AX Engineer - Infra\n\n주요 업무와 자격 요건이 포함된 충분한 길이의 공고 원문입니다.',
  pg_catalog.repeat('c', 64), 'wanted-jsonld-v1',
  '{"title":"AX Engineer - Infra","companyName":"미리디","datePosted":null,"validThrough":null,"employmentType":null,"location":null,"industry":null,"occupationalCategory":null}',
  pg_catalog.now()
);

do $$
declare
  run_status public.job_posting_collection_status;
  snapshot_count integer;
begin
  select status into run_status
    from public.job_posting_collection_runs
   where id = '00000000-0000-4000-8000-000000000133';
  if run_status <> 'succeeded' then
    raise exception 'collection did not succeed';
  end if;

  select count(*) into snapshot_count
    from public.job_posting_snapshots
   where job_posting_id = '00000000-0000-4000-8000-000000000132';
  if snapshot_count <> 1 then
    raise exception 'snapshot was not stored exactly once';
  end if;

  perform public.complete_job_posting_collection(
    '00000000-0000-4000-8000-000000000133',
    '00000000-0000-4000-8000-000000000131',
    '00000000-0000-4000-8000-000000000136',
    'succeeded'
  );

  begin
    update public.job_posting_snapshots
       set raw_content = 'changed'
     where job_posting_id = '00000000-0000-4000-8000-000000000132';
    raise exception 'immutable snapshot was updated';
  exception when check_violation then null;
  end;
end;
$$;

rollback;
