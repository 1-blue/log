alter table public.document_versions
  add column extraction_source text check (extraction_source in ('pdf', 'ocr', 'manual')),
  add column extraction_event_id uuid;

-- Lock the document before starting work; simultaneous requests share one attempt.
create function public.begin_document_extraction(p_owner_id uuid, p_document_id uuid, p_event_id uuid)
returns boolean language plpgsql security definer set search_path = '' as $$
declare target public.document_versions;
begin
  perform pg_advisory_xact_lock(hashtextextended(p_owner_id::text, 610063));
  select * into target from public.document_versions
   where owner_id = p_owner_id and id = p_document_id for update;
  if not found then raise exception 'resource_not_found'; end if;
  if target.extraction_status = 'ready' and nullif(btrim(target.extracted_text), '') is not null
     or target.extraction_status = 'processing' and target.updated_at > now() - interval '15 minutes' then
    return false;
  end if;
  update public.document_versions set extraction_status = 'processing', extraction_error = null,
    extraction_source = null, extraction_event_id = p_event_id
    where owner_id = p_owner_id and id = p_document_id;
  return true;
end;
$$;

create function public.finish_document_extraction(
  p_owner_id uuid, p_document_id uuid, p_event_id uuid, p_content_hash text,
  p_text text, p_error text, p_source text, p_profile jsonb default null,
  p_profile_metadata jsonb default null
)
returns boolean language plpgsql security definer set search_path = '' as $$
declare target public.document_versions;
begin
  p_error := nullif(p_error, '');
  perform pg_advisory_xact_lock(hashtextextended(p_owner_id::text, 610063));
  select * into target from public.document_versions
   where owner_id = p_owner_id and id = p_document_id for update;
  if not found then raise exception 'resource_not_found'; end if;
  -- Legacy processing rows have no attempt id. Only these accept legacy callbacks.
  if target.content_hash <> p_content_hash or target.extraction_status <> 'processing'
     or target.extraction_event_id is not null and target.extraction_event_id <> p_event_id then
    return false;
  end if;
  if p_error is null and (nullif(btrim(p_text), '') is null or char_length(p_text) > 500000)
     or p_source is null or p_source not in ('pdf', 'ocr') then raise exception 'invalid_extraction_result'; end if;
  if p_profile is not null and p_error is null then
    insert into public.document_analysis_profiles
      (owner_id, document_version_id, document_type, input_hash, model, prompt_version, reasoning_effort, source, status, profile)
    values (p_owner_id, p_document_id, target.document_type, p_content_hash,
      p_profile_metadata->>'model', coalesce(p_profile_metadata->>'promptVersion', 'document-profile-v1'),
      p_profile_metadata->>'reasoningEffort', 'ai', 'succeeded', p_profile)
    on conflict (owner_id, document_version_id, source, input_hash, prompt_version)
    do update set profile = excluded.profile;
  end if;
  update public.document_versions set
    extracted_text = case when p_error is null then btrim(p_text) else null end,
    extraction_status = case when p_error is null then 'ready'::public.document_extraction_status else 'failed'::public.document_extraction_status end,
    extraction_error = p_error, extraction_source = case when p_error is null then p_source else null end
    where owner_id = p_owner_id and id = p_document_id;
  return true;
end;
$$;

revoke all on function public.begin_document_extraction(uuid, uuid, uuid) from public, anon, authenticated;
revoke all on function public.finish_document_extraction(uuid, uuid, uuid, text, text, text, text, jsonb, jsonb) from public, anon, authenticated;
grant execute on function public.begin_document_extraction(uuid, uuid, uuid) to service_role;
grant execute on function public.finish_document_extraction(uuid, uuid, uuid, text, text, text, text, jsonb, jsonb) to service_role;
