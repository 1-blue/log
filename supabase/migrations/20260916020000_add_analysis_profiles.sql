do $$
begin
  create type public.career_analysis_source as enum ('fixture', 'ai');
exception when duplicate_object then null;
end $$;

do $$
begin
  create type public.career_analysis_profile_status as enum ('succeeded', 'failed');
exception when duplicate_object then null;
end $$;

create table public.document_analysis_profiles (
  id uuid primary key default extensions.gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete restrict,
  document_version_id uuid not null,
  document_type public.document_type not null,
  source public.career_analysis_source not null,
  status public.career_analysis_profile_status not null,
  input_hash text not null,
  profile jsonb not null,
  model text,
  reasoning_effort text,
  prompt_version text not null,
  created_at timestamptz not null default pg_catalog.now(),
  constraint document_analysis_profiles_document_fk
    foreign key (document_version_id, owner_id, document_type)
    references public.document_versions (id, owner_id, document_type)
    on delete restrict,
  constraint document_analysis_profiles_hash_check check (input_hash ~ '^[0-9a-f]{64}$'),
  constraint document_analysis_profiles_profile_object check (pg_catalog.jsonb_typeof(profile) = 'object'),
  constraint document_analysis_profiles_document_type_check check (document_type in ('resume', 'portfolio')),
  constraint document_analysis_profiles_unique_input
    unique (owner_id, document_version_id, source, input_hash, prompt_version),
  constraint document_analysis_profiles_id_owner_key unique (id, owner_id)
);

create table public.job_posting_analysis_profiles (
  id uuid primary key default extensions.gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete restrict,
  job_posting_id uuid not null,
  snapshot_id uuid not null,
  source public.career_analysis_source not null,
  status public.career_analysis_profile_status not null,
  input_hash text not null,
  profile jsonb not null,
  model text,
  reasoning_effort text,
  prompt_version text not null,
  created_at timestamptz not null default pg_catalog.now(),
  constraint job_posting_analysis_profiles_posting_fk
    foreign key (job_posting_id, owner_id)
    references public.job_postings (id, owner_id) on delete restrict,
  constraint job_posting_analysis_profiles_snapshot_fk
    foreign key (snapshot_id, owner_id)
    references public.job_posting_snapshots (id, owner_id) on delete restrict,
  constraint job_posting_analysis_profiles_hash_check check (input_hash ~ '^[0-9a-f]{64}$'),
  constraint job_posting_analysis_profiles_profile_object check (pg_catalog.jsonb_typeof(profile) = 'object'),
  constraint job_posting_analysis_profiles_unique_input
    unique (owner_id, snapshot_id, source, input_hash, prompt_version),
  constraint job_posting_analysis_profiles_id_owner_key unique (id, owner_id)
);

alter table public.analysis_jobs
  add column if not exists resume_profile_id uuid,
  add column if not exists portfolio_profile_id uuid,
  add column if not exists job_posting_profile_id uuid;

alter table public.analysis_jobs
  add constraint analysis_jobs_resume_profile_fk
    foreign key (resume_profile_id, owner_id)
    references public.document_analysis_profiles (id, owner_id) on delete restrict,
  add constraint analysis_jobs_portfolio_profile_fk
    foreign key (portfolio_profile_id, owner_id)
    references public.document_analysis_profiles (id, owner_id) on delete restrict,
  add constraint analysis_jobs_job_posting_profile_fk
    foreign key (job_posting_profile_id, owner_id)
    references public.job_posting_analysis_profiles (id, owner_id) on delete restrict;

create index document_analysis_profiles_owner_document_idx
  on public.document_analysis_profiles (owner_id, document_version_id, created_at desc);
create index job_posting_analysis_profiles_owner_snapshot_idx
  on public.job_posting_analysis_profiles (owner_id, snapshot_id, created_at desc);

alter table public.document_analysis_profiles enable row level security;
alter table public.job_posting_analysis_profiles enable row level security;

create policy "Owners can read document analysis profiles"
  on public.document_analysis_profiles for select to authenticated
  using ((select auth.uid()) = owner_id);
create policy "Owners can read job posting analysis profiles"
  on public.job_posting_analysis_profiles for select to authenticated
  using ((select auth.uid()) = owner_id);

revoke all on public.document_analysis_profiles, public.job_posting_analysis_profiles
  from anon, authenticated;
grant select on public.document_analysis_profiles, public.job_posting_analysis_profiles
  to authenticated;
grant all on public.document_analysis_profiles, public.job_posting_analysis_profiles
  to service_role;
