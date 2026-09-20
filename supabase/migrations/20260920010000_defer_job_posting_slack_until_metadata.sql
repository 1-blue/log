-- URL-first registration creates a temporary posting identity. Do not publish
-- a Slack root until the administrator confirms the collected metadata.
create or replace function private.enqueue_new_job_posting_slack()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.company_name = '확인 중'
     or new.title = 'Wanted 공고 ' || new.external_id then
    return new;
  end if;

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

create or replace function public.update_job_posting_details(
  p_owner_id uuid,
  p_job_posting_id uuid,
  p_company_name text,
  p_title text
)
returns public.job_postings
language plpgsql
security invoker
set search_path = ''
as $$
declare
  posting public.job_postings;
begin
  update public.job_postings
     set company_name = pg_catalog.btrim(p_company_name),
         title = pg_catalog.btrim(p_title)
   where id = p_job_posting_id
     and owner_id = p_owner_id
  returning * into posting;

  if posting.id is null then
    return null;
  end if;

  if posting.company_name <> '확인 중'
     and posting.title <> 'Wanted 공고 ' || posting.external_id then
    perform private.enqueue_slack_notification(
      posting.owner_id,
      posting.id,
      'job_posting_registered',
      'job_root',
      'job-posting:' || posting.id || ':registered',
      extensions.gen_random_uuid(),
      null,
      null,
      null,
      pg_catalog.jsonb_build_object(
        'companyName', posting.company_name,
        'title', posting.title,
        'url', posting.canonical_url
      )
    );
  end if;

  return posting;
end;
$$;
