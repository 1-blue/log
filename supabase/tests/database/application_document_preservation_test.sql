begin;

set local search_path = public, extensions;

select plan(22);

insert into auth.users (
  id, instance_id, aud, role, email, encrypted_password,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values (
  '00000000-0000-4000-8000-000000000281',
  '00000000-0000-0000-0000-000000000000',
  'authenticated',
  'authenticated',
  'application-document-preservation@example.com',
  '',
  '{"provider":"email","providers":["email"]}',
  '{}',
  pg_catalog.now(),
  pg_catalog.now()
) on conflict (id) do nothing;

insert into public.document_versions (
  id, owner_id, document_type, label, original_filename,
  storage_path, mime_type, file_size, content_hash
)
select
  fixture.id,
  '00000000-0000-4000-8000-000000000281',
  fixture.document_type,
  fixture.label,
  fixture.document_type::text || '.pdf',
  '00000000-0000-4000-8000-000000000281/' || fixture.document_type::text || '/' || fixture.id::text || '.pdf',
  'application/pdf',
  1,
  pg_catalog.repeat(fixture.hash_character, 64)
from (values
  ('00000000-0000-4000-8000-000000000282'::uuid, 'resume'::public.document_type, 'Original resume', 'a'),
  ('00000000-0000-4000-8000-000000000283'::uuid, 'portfolio'::public.document_type, 'Original portfolio', 'b'),
  ('00000000-0000-4000-8000-000000000284'::uuid, 'resume'::public.document_type, 'Replacement resume', 'c'),
  ('00000000-0000-4000-8000-000000000285'::uuid, 'portfolio'::public.document_type, 'Replacement portfolio', 'd')
) as fixture(id, document_type, label, hash_character);

create temporary table document_preservation_context (
  draft_id uuid not null,
  locked_id uuid,
  job_posting_id uuid not null
) on commit drop;

insert into document_preservation_context (draft_id, job_posting_id)
select created.id, created.job_posting_id
  from public.create_application_with_posting(
    '00000000-0000-4000-8000-000000000281',
    'wanted',
    '928281',
    'https://www.wanted.co.kr/wd/928281',
    'Document preservation test',
    'Frontend Engineer',
    'interested',
    null, null, null,
    '00000000-0000-4000-8000-000000000282',
    '00000000-0000-4000-8000-000000000283'
  ) as created;

update document_preservation_context
   set locked_id = (
     select created.id
       from public.create_application_attempt(
         '00000000-0000-4000-8000-000000000281',
         (select job_posting_id from document_preservation_context),
         'applied', current_date, null, null,
         '00000000-0000-4000-8000-000000000282',
         '00000000-0000-4000-8000-000000000283'
       ) as created
   );

-- A distinct timestamp detects unnecessary deletion and reinsertion as well
-- as a change to the selected document IDs.
update public.application_documents
   set selected_at = '2026-09-01T00:00:00Z'
 where application_id = (select draft_id from document_preservation_context);

create temporary table original_document_selections on commit drop as
select document_type, document_version_id, selected_at
  from public.application_documents
 where application_id = (select draft_id from document_preservation_context);

update public.document_versions
   set archived_at = pg_catalog.now()
 where id in (
   '00000000-0000-4000-8000-000000000282',
   '00000000-0000-4000-8000-000000000283'
 );

select lives_ok(
  format(
    $$select public.replace_application_state(
      '00000000-0000-4000-8000-000000000281', %L, 'interested',
      null, null, null,
      '00000000-0000-4000-8000-000000000282',
      '00000000-0000-4000-8000-000000000283', true
    )$$,
    (select draft_id from document_preservation_context)
  ),
  'an unlocked application can be archived after its selected documents are archived'
);

select ok(
  (select archived_at is not null and status = 'interested' and documents_locked_at is null
     from public.applications where id = (select draft_id from document_preservation_context)),
  'archiving preserves the application business status and unlocked state'
);

select results_eq(
  $$select document_type, document_version_id, selected_at
      from public.application_documents
     where application_id = (select draft_id from document_preservation_context)
     order by document_type$$,
  $$select document_type, document_version_id, selected_at
      from original_document_selections order by document_type$$,
  'archive preserves both document selections and their original selection times'
);

select lives_ok(
  format(
    $$select public.replace_application_state(
      '00000000-0000-4000-8000-000000000281', %L, 'interested',
      null, null, null,
      '00000000-0000-4000-8000-000000000282',
      '00000000-0000-4000-8000-000000000283', false
    )$$,
    (select draft_id from document_preservation_context)
  ),
  'an application can be restored while its selected documents remain archived'
);

select is(
  (select archived_at from public.applications where id = (select draft_id from document_preservation_context)),
  null,
  'restore clears only the application archive state'
);

select lives_ok(
  format(
    $$select public.replace_application_state(
      '00000000-0000-4000-8000-000000000281', %L, 'preparing',
      null, null, 'Updated note',
      '00000000-0000-4000-8000-000000000282',
      '00000000-0000-4000-8000-000000000283', false
    )$$,
    (select draft_id from document_preservation_context)
  ),
  'status and note updates do not reselect unchanged archived documents'
);

select ok(
  (select status = 'preparing' and note = 'Updated note'
     from public.applications where id = (select draft_id from document_preservation_context)),
  'non-document application fields are updated'
);

select results_eq(
  $$select document_type, document_version_id, selected_at
      from public.application_documents
     where application_id = (select draft_id from document_preservation_context)
     order by document_type$$,
  $$select document_type, document_version_id, selected_at
      from original_document_selections order by document_type$$,
  'restore and metadata edits preserve the original document selections'
);

select lives_ok(
  format(
    $$select public.replace_application_state(
      '00000000-0000-4000-8000-000000000281', %L, 'preparing',
      null, null, 'Updated note',
      '00000000-0000-4000-8000-000000000284',
      '00000000-0000-4000-8000-000000000283', false
    )$$,
    (select draft_id from document_preservation_context)
  ),
  'replacing the resume does not reselect an unchanged archived portfolio'
);

select ok(
  (select document_version_id = '00000000-0000-4000-8000-000000000284'
     from public.application_documents
    where application_id = (select draft_id from document_preservation_context) and document_type = 'resume')
  and (select document_version_id = '00000000-0000-4000-8000-000000000283' and selected_at = '2026-09-01T00:00:00Z'
         from public.application_documents
        where application_id = (select draft_id from document_preservation_context) and document_type = 'portfolio'),
  'only the changed resume selection is replaced'
);

update public.document_versions
   set archived_at = pg_catalog.now()
 where id = '00000000-0000-4000-8000-000000000284';

select lives_ok(
  format(
    $$select public.replace_application_state(
      '00000000-0000-4000-8000-000000000281', %L, 'preparing',
      null, null, 'Updated note',
      '00000000-0000-4000-8000-000000000284',
      '00000000-0000-4000-8000-000000000285', false
    )$$,
    (select draft_id from document_preservation_context)
  ),
  'replacing the portfolio does not reselect an unchanged archived resume'
);

select results_eq(
  $$select document_type::text, document_version_id
      from public.application_documents
     where application_id = (select draft_id from document_preservation_context)
     order by document_type$$,
  $$values
    ('portfolio', '00000000-0000-4000-8000-000000000285'::uuid),
    ('resume', '00000000-0000-4000-8000-000000000284'::uuid)$$,
  'both replacement selections are retained'
);

select lives_ok(
  format(
    $$select public.replace_application_state(
      '00000000-0000-4000-8000-000000000281', %L, 'preparing',
      null, null, 'Updated note', null,
      '00000000-0000-4000-8000-000000000285', false
    )$$,
    (select draft_id from document_preservation_context)
  ),
  'an unlocked archived document selection can still be removed'
);

select results_eq(
  $$select document_type::text, document_version_id
      from public.application_documents
     where application_id = (select draft_id from document_preservation_context)$$,
  $$values ('portfolio', '00000000-0000-4000-8000-000000000285'::uuid)$$,
  'removing the resume leaves the portfolio selection intact'
);

select throws_ok(
  format(
    $$select public.replace_application_state(
      '00000000-0000-4000-8000-000000000281', %L, 'preparing',
      null, null, 'Updated note',
      '00000000-0000-4000-8000-000000000282',
      '00000000-0000-4000-8000-000000000285', false
    )$$,
    (select draft_id from document_preservation_context)
  ),
  '23514', 'An archived document cannot be selected',
  'an archived resume still cannot be newly selected'
);

select throws_ok(
  format(
    $$select public.replace_application_state(
      '00000000-0000-4000-8000-000000000281', %L, 'preparing',
      null, null, 'Updated note', null,
      '00000000-0000-4000-8000-000000000283', false
    )$$,
    (select draft_id from document_preservation_context)
  ),
  '23514', 'An archived document cannot be selected',
  'an active portfolio still cannot be replaced with a different archived version'
);

select results_eq(
  $$select document_type::text, document_version_id
      from public.application_documents
     where application_id = (select draft_id from document_preservation_context)$$,
  $$values ('portfolio', '00000000-0000-4000-8000-000000000285'::uuid)$$,
  'failed document replacements roll back without losing the existing selection'
);

select throws_ok(
  format(
    $$select public.create_application_attempt(
      '00000000-0000-4000-8000-000000000281', %L, 'interested',
      null, null, null,
      '00000000-0000-4000-8000-000000000282',
      '00000000-0000-4000-8000-000000000283'
    )$$,
    (select job_posting_id from document_preservation_context)
  ),
  '23514', 'An archived document cannot be selected',
  'a new application attempt still cannot select archived documents'
);

select lives_ok(
  format(
    $$select public.replace_application_state(
      '00000000-0000-4000-8000-000000000281', %L, 'applied',
      current_date, null, null,
      '00000000-0000-4000-8000-000000000282',
      '00000000-0000-4000-8000-000000000283', true
    )$$,
    (select locked_id from document_preservation_context)
  ),
  'locked applications can still be archived with archived document references'
);

select lives_ok(
  format(
    $$select public.replace_application_state(
      '00000000-0000-4000-8000-000000000281', %L, 'applied',
      current_date, null, null,
      '00000000-0000-4000-8000-000000000282',
      '00000000-0000-4000-8000-000000000283', false
    )$$,
    (select locked_id from document_preservation_context)
  ),
  'locked applications can still be restored with archived document references'
);

select throws_ok(
  format(
    $$select public.replace_application_state(
      '00000000-0000-4000-8000-000000000281', %L, 'applied',
      current_date, null, null,
      '00000000-0000-4000-8000-000000000282',
      '00000000-0000-4000-8000-000000000285', false
    )$$,
    (select locked_id from document_preservation_context)
  ),
  '23514', 'Submitted application documents cannot be changed',
  'preserving archived references does not weaken the submitted document lock'
);

select ok(
  (select archived_at is null and documents_locked_at is not null
     from public.applications where id = (select locked_id from document_preservation_context))
  and (select count(*) = 2 from public.application_documents
        where application_id = (select locked_id from document_preservation_context)
          and document_version_id in (
            '00000000-0000-4000-8000-000000000282',
            '00000000-0000-4000-8000-000000000283'
          )),
  'locked applications retain both selected documents and their lock after restore'
);

select * from finish();

rollback;
