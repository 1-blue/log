create type public.analysis_match_status as enum (
  'matched', 'partial', 'missing', 'unknown'
);

create type public.analysis_priority as enum ('high', 'medium', 'low');

create type public.interview_checklist_source as enum (
  'gap_action', 'custom'
);

alter table public.analysis_jobs
  add constraint analysis_jobs_id_application_owner_key
  unique (id, application_id, owner_id);

create table public.analysis_reviews (
  analysis_job_id uuid primary key,
  owner_id uuid not null,
  overall_note text,
  created_at timestamptz not null default pg_catalog.now(),
  updated_at timestamptz not null default pg_catalog.now(),
  constraint analysis_reviews_job_fk
    foreign key (analysis_job_id, owner_id)
    references public.analysis_jobs (id, owner_id) on delete restrict,
  constraint analysis_reviews_note_length
    check (overall_note is null or pg_catalog.char_length(pg_catalog.btrim(overall_note)) between 1 and 20000)
);

create table public.analysis_requirement_reviews (
  id uuid primary key default extensions.gen_random_uuid(),
  analysis_job_id uuid not null,
  owner_id uuid not null,
  requirement_id text not null,
  override_status public.analysis_match_status,
  note text,
  created_at timestamptz not null default pg_catalog.now(),
  updated_at timestamptz not null default pg_catalog.now(),
  constraint analysis_requirement_reviews_job_fk
    foreign key (analysis_job_id, owner_id)
    references public.analysis_jobs (id, owner_id) on delete restrict,
  constraint analysis_requirement_reviews_unique
    unique (analysis_job_id, requirement_id),
  constraint analysis_requirement_reviews_id_owner_key unique (id, owner_id),
  constraint analysis_requirement_reviews_requirement_length
    check (pg_catalog.char_length(requirement_id) between 1 and 100),
  constraint analysis_requirement_reviews_note_length
    check (note is null or pg_catalog.char_length(pg_catalog.btrim(note)) between 1 and 5000),
  constraint analysis_requirement_reviews_content_check
    check (override_status is not null or note is not null)
);

create table public.interview_questions (
  id uuid primary key default extensions.gen_random_uuid(),
  analysis_job_id uuid not null,
  owner_id uuid not null,
  source_index integer not null check (source_index >= 0),
  category text not null,
  question text not null,
  intent text not null,
  priority public.analysis_priority not null,
  requirement_ids text[] not null default '{}',
  created_at timestamptz not null default pg_catalog.now(),
  constraint interview_questions_job_fk
    foreign key (analysis_job_id, owner_id)
    references public.analysis_jobs (id, owner_id) on delete restrict,
  constraint interview_questions_source_key unique (analysis_job_id, source_index),
  constraint interview_questions_id_owner_key unique (id, owner_id),
  constraint interview_questions_lengths check (
    pg_catalog.char_length(category) between 1 and 200
    and pg_catalog.char_length(question) between 1 and 2000
    and pg_catalog.char_length(intent) between 1 and 2000
    and pg_catalog.cardinality(requirement_ids) <= 10
  )
);

create table public.interview_answers (
  id uuid primary key default extensions.gen_random_uuid(),
  question_id uuid not null,
  owner_id uuid not null,
  revision integer not null check (revision > 0),
  answer text,
  created_at timestamptz not null default pg_catalog.now(),
  constraint interview_answers_question_fk
    foreign key (question_id, owner_id)
    references public.interview_questions (id, owner_id) on delete restrict,
  constraint interview_answers_question_revision_key unique (question_id, revision),
  constraint interview_answers_length
    check (answer is null or pg_catalog.char_length(pg_catalog.btrim(answer)) between 1 and 20000)
);

create table public.interview_checklist_items (
  id uuid primary key default extensions.gen_random_uuid(),
  analysis_job_id uuid not null,
  owner_id uuid not null,
  source public.interview_checklist_source not null,
  source_key text,
  content text not null,
  priority public.analysis_priority not null,
  position integer not null check (position >= 0),
  completed_at timestamptz,
  archived_at timestamptz,
  created_at timestamptz not null default pg_catalog.now(),
  updated_at timestamptz not null default pg_catalog.now(),
  constraint interview_checklist_items_job_fk
    foreign key (analysis_job_id, owner_id)
    references public.analysis_jobs (id, owner_id) on delete restrict,
  constraint interview_checklist_items_id_owner_key unique (id, owner_id),
  constraint interview_checklist_items_content_length
    check (pg_catalog.char_length(pg_catalog.btrim(content)) between 1 and 2000),
  constraint interview_checklist_items_source_check check (
    (source = 'gap_action' and source_key is not null and pg_catalog.char_length(source_key) between 1 and 100)
    or (source = 'custom' and source_key is null)
  )
);

create unique index interview_checklist_items_generated_key_idx
  on public.interview_checklist_items (analysis_job_id, source_key)
  where source_key is not null;

create table public.interview_notes (
  id uuid primary key default extensions.gen_random_uuid(),
  application_id uuid not null,
  analysis_job_id uuid not null,
  owner_id uuid not null,
  round_label text not null,
  interviewed_at timestamptz not null,
  questions_asked text,
  went_well text,
  improvements text,
  follow_up_actions text,
  content text,
  archived_at timestamptz,
  created_at timestamptz not null default pg_catalog.now(),
  updated_at timestamptz not null default pg_catalog.now(),
  constraint interview_notes_analysis_fk
    foreign key (analysis_job_id, application_id, owner_id)
    references public.analysis_jobs (id, application_id, owner_id) on delete restrict,
  constraint interview_notes_application_fk
    foreign key (application_id, owner_id)
    references public.applications (id, owner_id) on delete restrict,
  constraint interview_notes_id_owner_key unique (id, owner_id),
  constraint interview_notes_round_length
    check (pg_catalog.char_length(pg_catalog.btrim(round_label)) between 1 and 100),
  constraint interview_notes_content_length check (
    (questions_asked is null or pg_catalog.char_length(pg_catalog.btrim(questions_asked)) between 1 and 20000)
    and (went_well is null or pg_catalog.char_length(pg_catalog.btrim(went_well)) between 1 and 20000)
    and (improvements is null or pg_catalog.char_length(pg_catalog.btrim(improvements)) between 1 and 20000)
    and (follow_up_actions is null or pg_catalog.char_length(pg_catalog.btrim(follow_up_actions)) between 1 and 20000)
    and (content is null or pg_catalog.char_length(pg_catalog.btrim(content)) between 1 and 20000)
  ),
  constraint interview_notes_content_required check (
    pg_catalog.num_nonnulls(questions_asked, went_well, improvements, follow_up_actions, content) > 0
  )
);

create index analysis_reviews_owner_job_idx
  on public.analysis_reviews (owner_id, analysis_job_id);
create index analysis_requirement_reviews_owner_job_idx
  on public.analysis_requirement_reviews (owner_id, analysis_job_id, requirement_id);
create index interview_questions_owner_job_idx
  on public.interview_questions (owner_id, analysis_job_id, source_index);
create index interview_answers_owner_question_revision_idx
  on public.interview_answers (owner_id, question_id, revision desc);
create index interview_checklist_items_owner_job_position_idx
  on public.interview_checklist_items (owner_id, analysis_job_id, position, id)
  where archived_at is null;
create index interview_notes_owner_application_interviewed_idx
  on public.interview_notes (owner_id, application_id, interviewed_at desc, id desc)
  where archived_at is null;

create trigger analysis_reviews_set_updated_at
  before update on public.analysis_reviews
  for each row execute function private.set_updated_at();
create trigger analysis_requirement_reviews_set_updated_at
  before update on public.analysis_requirement_reviews
  for each row execute function private.set_updated_at();
create trigger interview_checklist_items_set_updated_at
  before update on public.interview_checklist_items
  for each row execute function private.set_updated_at();
create trigger interview_notes_set_updated_at
  before update on public.interview_notes
  for each row execute function private.set_updated_at();

create trigger interview_questions_reject_mutation
  before update or delete on public.interview_questions
  for each row execute function private.reject_analysis_immutable_mutation();
create trigger interview_answers_reject_mutation
  before update or delete on public.interview_answers
  for each row execute function private.reject_analysis_immutable_mutation();

create or replace function private.seed_analysis_workspace()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.interview_questions (
    analysis_job_id, owner_id, source_index, category, question, intent,
    priority, requirement_ids
  )
  select
    new.analysis_job_id,
    new.owner_id,
    question.ordinality - 1,
    question.value->>'category',
    question.value->>'question',
    question.value->>'intent',
    (question.value->>'priority')::public.analysis_priority,
    coalesce(
      array(
        select pg_catalog.jsonb_array_elements_text(question.value->'requirementIds')
      ),
      '{}'
    )
  from pg_catalog.jsonb_array_elements(
    new.result->'comparison'->'interviewQuestions'
  ) with ordinality as question(value, ordinality)
  on conflict (analysis_job_id, source_index) do nothing;

  insert into public.interview_checklist_items (
    analysis_job_id, owner_id, source, source_key, content, priority, position
  )
  select
    new.analysis_job_id,
    new.owner_id,
    'gap_action'::public.interview_checklist_source,
    pg_catalog.format('gap:%s:action:%s', gap.ordinality - 1, action.ordinality - 1),
    action.value #>> '{}',
    (gap.value->>'priority')::public.analysis_priority,
    ((gap.ordinality - 1) * 100 + action.ordinality - 1)::integer
  from pg_catalog.jsonb_array_elements(new.result->'comparison'->'gaps')
    with ordinality as gap(value, ordinality)
  cross join lateral pg_catalog.jsonb_array_elements(gap.value->'actions')
    with ordinality as action(value, ordinality)
  on conflict (analysis_job_id, source_key) where source_key is not null do nothing;

  return new;
end;
$$;

create trigger analysis_results_seed_interview_workspace
  after insert on public.analysis_results
  for each row execute function private.seed_analysis_workspace();

insert into public.interview_questions (
  analysis_job_id, owner_id, source_index, category, question, intent,
  priority, requirement_ids
)
select
  result.analysis_job_id,
  result.owner_id,
  question.ordinality - 1,
  question.value->>'category',
  question.value->>'question',
  question.value->>'intent',
  (question.value->>'priority')::public.analysis_priority,
  coalesce(
    array(
      select pg_catalog.jsonb_array_elements_text(question.value->'requirementIds')
    ),
    '{}'
  )
from public.analysis_results as result
cross join lateral pg_catalog.jsonb_array_elements(
  result.result->'comparison'->'interviewQuestions'
) with ordinality as question(value, ordinality)
on conflict (analysis_job_id, source_index) do nothing;

insert into public.interview_checklist_items (
  analysis_job_id, owner_id, source, source_key, content, priority, position
)
select
  result.analysis_job_id,
  result.owner_id,
  'gap_action'::public.interview_checklist_source,
  pg_catalog.format('gap:%s:action:%s', gap.ordinality - 1, action.ordinality - 1),
  action.value #>> '{}',
  (gap.value->>'priority')::public.analysis_priority,
  ((gap.ordinality - 1) * 100 + action.ordinality - 1)::integer
from public.analysis_results as result
cross join lateral pg_catalog.jsonb_array_elements(result.result->'comparison'->'gaps')
  with ordinality as gap(value, ordinality)
cross join lateral pg_catalog.jsonb_array_elements(gap.value->'actions')
  with ordinality as action(value, ordinality)
on conflict (analysis_job_id, source_key) where source_key is not null do nothing;

create or replace function public.save_analysis_review(
  p_analysis_job_id uuid,
  p_owner_id uuid,
  p_expected_updated_at timestamptz default null,
  p_overall_note text default null,
  p_requirements jsonb default '[]'::jsonb
)
returns public.analysis_reviews
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_job public.analysis_jobs;
  current_review public.analysis_reviews;
  saved_review public.analysis_reviews;
  requirement jsonb;
  known_requirement_ids text[];
  supplied_requirement_ids text[];
begin
  select * into target_job
    from public.analysis_jobs
   where id = p_analysis_job_id and owner_id = p_owner_id
   for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'Analysis job not found';
  end if;
  if target_job.status <> 'succeeded' then
    raise exception using errcode = '23514', message = 'Only completed analyses can be reviewed';
  end if;

  select * into current_review
    from public.analysis_reviews
   where analysis_job_id = p_analysis_job_id;
  if found and (p_expected_updated_at is null or current_review.updated_at <> p_expected_updated_at) then
    raise exception using errcode = '40001', message = 'Analysis review was updated elsewhere';
  elsif not found and p_expected_updated_at is not null then
    raise exception using errcode = '40001', message = 'Analysis review was updated elsewhere';
  end if;

  select array_agg(value->>'id') into known_requirement_ids
    from public.analysis_results as result,
         lateral pg_catalog.jsonb_array_elements(result.result->'job'->'requirements')
   where result.analysis_job_id = p_analysis_job_id;
  select array_agg(value->>'requirementId') into supplied_requirement_ids
    from pg_catalog.jsonb_array_elements(p_requirements);
  if coalesce(pg_catalog.cardinality(supplied_requirement_ids), 0) <>
     coalesce((select count(distinct value) from unnest(supplied_requirement_ids) as value), 0) then
    raise exception using errcode = '23514', message = 'Requirement reviews must be unique';
  end if;
  if exists (
    select 1 from unnest(coalesce(supplied_requirement_ids, '{}')) as supplied
    where not (supplied = any(coalesce(known_requirement_ids, '{}')))
  ) then
    raise exception using errcode = '23514', message = 'Unknown requirement review';
  end if;

  insert into public.analysis_reviews (analysis_job_id, owner_id, overall_note)
  values (p_analysis_job_id, p_owner_id, p_overall_note)
  on conflict (analysis_job_id) do update set overall_note = excluded.overall_note
  returning * into saved_review;

  delete from public.analysis_requirement_reviews
   where analysis_job_id = p_analysis_job_id and owner_id = p_owner_id;
  for requirement in select value from pg_catalog.jsonb_array_elements(p_requirements)
  loop
    insert into public.analysis_requirement_reviews (
      analysis_job_id, owner_id, requirement_id, override_status, note
    ) values (
      p_analysis_job_id,
      p_owner_id,
      requirement->>'requirementId',
      (requirement->>'overrideStatus')::public.analysis_match_status,
      requirement->>'note'
    );
  end loop;

  return saved_review;
end;
$$;

create or replace function public.save_interview_answer(
  p_question_id uuid,
  p_owner_id uuid,
  p_answer text default null
)
returns public.interview_answers
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_answer public.interview_answers;
  saved_answer public.interview_answers;
begin
  perform 1
    from public.interview_questions
   where id = p_question_id and owner_id = p_owner_id
   for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'Interview question not found';
  end if;

  select * into current_answer
    from public.interview_answers
   where question_id = p_question_id and owner_id = p_owner_id
   order by revision desc limit 1;
  if found and current_answer.answer is not distinct from p_answer then
    return current_answer;
  elsif not found and p_answer is null then
    return null;
  end if;

  insert into public.interview_answers (question_id, owner_id, revision, answer)
  values (
    p_question_id,
    p_owner_id,
    coalesce(current_answer.revision, 0) + 1,
    p_answer
  ) returning * into saved_answer;
  return saved_answer;
end;
$$;

create or replace function public.reorder_interview_checklist(
  p_analysis_job_id uuid,
  p_owner_id uuid,
  p_item_ids uuid[]
)
returns setof public.interview_checklist_items
language plpgsql
security definer
set search_path = ''
as $$
declare
  expected_count integer;
begin
  perform 1 from public.analysis_jobs
   where id = p_analysis_job_id and owner_id = p_owner_id
   for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'Analysis job not found';
  end if;

  select count(*) into expected_count
    from public.interview_checklist_items
   where analysis_job_id = p_analysis_job_id
     and owner_id = p_owner_id
     and archived_at is null;
  if pg_catalog.cardinality(p_item_ids) <> expected_count
     or (select count(distinct item_id) from unnest(p_item_ids) as item_id) <> expected_count
     or exists (
       select 1 from unnest(p_item_ids) as item_id
       where not exists (
         select 1 from public.interview_checklist_items as item
          where item.id = item_id
            and item.analysis_job_id = p_analysis_job_id
            and item.owner_id = p_owner_id
            and item.archived_at is null
       )
     ) then
    raise exception using errcode = '23514', message = 'Checklist order must include every active item';
  end if;

  update public.interview_checklist_items as item
     set position = ordering.ordinality - 1
    from unnest(p_item_ids) with ordinality as ordering(id, ordinality)
   where item.id = ordering.id
     and item.analysis_job_id = p_analysis_job_id
     and item.owner_id = p_owner_id;

  return query
    select * from public.interview_checklist_items
     where analysis_job_id = p_analysis_job_id
       and owner_id = p_owner_id
       and archived_at is null
     order by position, id;
end;
$$;

alter table public.analysis_reviews enable row level security;
alter table public.analysis_requirement_reviews enable row level security;
alter table public.interview_questions enable row level security;
alter table public.interview_answers enable row level security;
alter table public.interview_checklist_items enable row level security;
alter table public.interview_notes enable row level security;

create policy "Owners can read their analysis reviews" on public.analysis_reviews
  for select to authenticated using ((select auth.uid()) = owner_id);
create policy "Owners can read requirement reviews" on public.analysis_requirement_reviews
  for select to authenticated using ((select auth.uid()) = owner_id);
create policy "Owners can read interview questions" on public.interview_questions
  for select to authenticated using ((select auth.uid()) = owner_id);
create policy "Owners can read interview answers" on public.interview_answers
  for select to authenticated using ((select auth.uid()) = owner_id);
create policy "Owners can read interview checklist" on public.interview_checklist_items
  for select to authenticated using ((select auth.uid()) = owner_id);
create policy "Owners can read interview notes" on public.interview_notes
  for select to authenticated using ((select auth.uid()) = owner_id);

revoke all on public.analysis_reviews, public.analysis_requirement_reviews,
  public.interview_questions, public.interview_answers,
  public.interview_checklist_items, public.interview_notes from anon, authenticated;
grant select on public.analysis_reviews, public.analysis_requirement_reviews,
  public.interview_questions, public.interview_answers,
  public.interview_checklist_items, public.interview_notes to authenticated;
grant all on public.analysis_reviews, public.analysis_requirement_reviews,
  public.interview_questions, public.interview_answers,
  public.interview_checklist_items, public.interview_notes to service_role;

revoke all on function private.seed_analysis_workspace() from public;
grant execute on function private.seed_analysis_workspace() to service_role;
revoke all on function public.save_analysis_review(uuid, uuid, timestamptz, text, jsonb)
  from public, anon, authenticated;
grant execute on function public.save_analysis_review(uuid, uuid, timestamptz, text, jsonb)
  to service_role;
revoke all on function public.save_interview_answer(uuid, uuid, text)
  from public, anon, authenticated;
grant execute on function public.save_interview_answer(uuid, uuid, text)
  to service_role;
revoke all on function public.reorder_interview_checklist(uuid, uuid, uuid[])
  from public, anon, authenticated;
grant execute on function public.reorder_interview_checklist(uuid, uuid, uuid[])
  to service_role;
