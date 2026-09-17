-- The stale-job sweep filters and orders by the same fallback timestamp.
-- Index that expression so the service-role RPC can use one bounded scan even
-- when a heartbeat has not been recorded yet.
drop index if exists public.analysis_jobs_stale_idx;

create index analysis_jobs_stale_idx
  on public.analysis_jobs (
    (coalesce(last_heartbeat_at, updated_at, created_at)),
    id
  )
  where status in ('queued', 'running', 'retrying');
