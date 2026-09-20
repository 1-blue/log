-- Preserve the exact input policy used by each dispatch.  A later configuration
-- change must not make an old analysis look as if it used the new inputs.
alter table public.analysis_jobs
  add column if not exists input_audit jsonb;

alter table public.analysis_jobs
  drop constraint if exists analysis_jobs_input_audit_object;

alter table public.analysis_jobs
  add constraint analysis_jobs_input_audit_object
  check (input_audit is null or pg_catalog.jsonb_typeof(input_audit) = 'object');

do $$
begin
  create type public.document_evidence_review_status as enum (
    'pending', 'confirmed', 'rejected'
  );
exception when duplicate_object then null;
end $$;

create table public.document_evidence_reviews (
  id uuid primary key default extensions.gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete restrict,
  document_version_id uuid not null,
  document_type public.document_type not null,
  profile_id uuid not null,
  evidence_key text not null,
  page integer,
  section text,
  excerpt text not null,
  observation text not null,
  status public.document_evidence_review_status not null default 'pending',
  note text,
  created_at timestamptz not null default pg_catalog.now(),
  updated_at timestamptz not null default pg_catalog.now(),
  constraint document_evidence_reviews_document_fk
    foreign key (document_version_id, owner_id, document_type)
    references public.document_versions (id, owner_id, document_type)
    on delete restrict,
  constraint document_evidence_reviews_profile_fk
    foreign key (profile_id, owner_id)
    references public.document_analysis_profiles (id, owner_id)
    on delete restrict,
  constraint document_evidence_reviews_page_check
    check (page is null or page between 1 and 10000),
  constraint document_evidence_reviews_lengths_check check (
    pg_catalog.char_length(evidence_key) between 1 and 200
    and pg_catalog.char_length(excerpt) between 1 and 500
    and pg_catalog.char_length(observation) between 1 and 2000
    and (section is null or pg_catalog.char_length(section) <= 200)
    and (note is null or pg_catalog.char_length(note) <= 1000)
  ),
  constraint document_evidence_reviews_unique_key
    unique (owner_id, profile_id, evidence_key),
  constraint document_evidence_reviews_id_owner_key unique (id, owner_id)
);

create index document_evidence_reviews_owner_document_idx
  on public.document_evidence_reviews (owner_id, document_version_id, updated_at desc);

create trigger document_evidence_reviews_set_updated_at
  before update on public.document_evidence_reviews
  for each row execute function private.set_updated_at();

alter table public.document_evidence_reviews enable row level security;
create policy "Owners can read their document evidence reviews"
  on public.document_evidence_reviews for select to authenticated
  using ((select auth.uid()) = owner_id);

revoke all on public.document_evidence_reviews from anon, authenticated;
grant select on public.document_evidence_reviews to authenticated;
grant all on public.document_evidence_reviews to service_role;
