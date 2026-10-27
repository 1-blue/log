-- Missing optional job sections are warnings, not failures. Preserve precise
-- safe causes for actual failures without storing source/provider text in logs.
alter type public.job_posting_collection_error_code add value if not exists 'SOURCE_TEXT_EMPTY';
alter type public.job_posting_collection_error_code add value if not exists 'SOURCE_NOT_JOB_POSTING';
alter type public.job_posting_collection_error_code add value if not exists 'AI_RESPONSE_INVALID';
alter type public.job_posting_collection_error_code add value if not exists 'AI_EVIDENCE_MISMATCH';
alter type public.job_posting_collection_error_code add value if not exists 'AI_SOURCE_MISMATCH';
alter type public.job_posting_collection_error_code add value if not exists 'AI_METADATA_MISMATCH';
alter type public.job_posting_collection_error_code add value if not exists 'AI_TIMEOUT';
alter type public.job_posting_collection_error_code add value if not exists 'AI_RATE_LIMITED';
alter type public.job_posting_collection_error_code add value if not exists 'AI_AUTHENTICATION_FAILED';
alter type public.job_posting_collection_error_code add value if not exists 'AI_BILLING_LIMIT';
alter type public.job_posting_collection_error_code add value if not exists 'AI_SERVICE_UNAVAILABLE';
