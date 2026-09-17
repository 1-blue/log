alter type public.job_posting_snapshot_source
  add value if not exists 'wanted_html';

alter type public.job_posting_snapshot_source
  add value if not exists 'wanted_ai';
