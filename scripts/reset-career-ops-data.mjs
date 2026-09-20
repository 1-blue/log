import { chmodSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";

const ownerId = process.env.ADMIN_USER_ID;
const apply = process.argv.includes("--apply");
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

if (!ownerId || !uuidPattern.test(ownerId)) {
  throw new Error("ADMIN_USER_ID에 관리자 UUID를 지정해야 합니다.");
}

const query = (sql, label) => {
  console.log(`\n[career-reset] ${label}`);
  return execFileSync(
    "pnpm",
    ["exec", "supabase", "db", "query", "--linked", sql],
    { encoding: "utf8", stdio: ["ignore", "pipe", "inherit"] },
  );
};

const owner = ownerId.replaceAll("'", "''");
const countSql = `
select jsonb_build_object(
  'jobPostings', (select count(*) from public.job_postings where owner_id = '${owner}'::uuid),
  'applications', (select count(*) from public.applications where owner_id = '${owner}'::uuid),
  'analysisJobs', (select count(*) from public.analysis_jobs where owner_id = '${owner}'::uuid),
  'collectionRuns', (select count(*) from public.job_posting_collection_runs where owner_id = '${owner}'::uuid),
  'slackNotifications', (select count(*) from public.slack_notifications where owner_id = '${owner}'::uuid),
  'documentVersions', (select count(*) from public.document_versions where owner_id = '${owner}'::uuid)
) as career_ops_reset_preview;
`;
console.log(query(countSql, "삭제 예정 건수와 보존 문서 건수 확인").trim());

if (!apply) {
  console.log("\n실제 삭제는 실행하지 않았습니다. 확인 후 --apply를 붙여 다시 실행하세요.");
  process.exit(0);
}

const backupDir = join(process.cwd(), ".local", "career-ops-backups");
mkdirSync(backupDir, { recursive: true, mode: 0o700 });
const backupPath = join(
  backupDir,
  `public-data-before-career-reset-${new Date().toISOString().replaceAll(/[:.]/g, "-")}.sql`,
);
execFileSync(
  "pnpm",
  [
    "exec",
    "supabase",
    "db",
    "dump",
    "--linked",
    "--data-only",
    "--schema",
    "public",
    "--file",
    backupPath,
  ],
  { stdio: "inherit" },
);
chmodSync(backupPath, 0o600);
console.log(`[career-reset] 백업 저장: ${backupPath}`);

const sqlPath = join(tmpdir(), `career-ops-reset-${process.pid}.sql`);
const sql = `
begin;

create temporary table reset_postings on commit drop as
  select id from public.job_postings where owner_id = '${owner}'::uuid;
create temporary table reset_applications on commit drop as
  select id from public.applications where owner_id = '${owner}'::uuid;
create temporary table reset_analysis_jobs on commit drop as
  select id from public.analysis_jobs where owner_id = '${owner}'::uuid;
create temporary table reset_collection_runs on commit drop as
  select id from public.job_posting_collection_runs where owner_id = '${owner}'::uuid;

do $$
begin
  if exists (select 1 from public.analysis_jobs where owner_id = '${owner}'::uuid and status in ('queued','running','retrying'))
    or exists (select 1 from public.job_posting_collection_runs where owner_id = '${owner}'::uuid and status in ('queued','running'))
    or exists (select 1 from public.slack_notifications where owner_id = '${owner}'::uuid and status = 'dispatching') then
    raise exception '실행 중인 분석·수집·알림이 있어 초기화를 중단했습니다';
  end if;
end $$;

-- These tables are intentionally immutable during normal operation. The
-- explicitly requested reset is the only path that temporarily disables their
-- user triggers, and restores every trigger before committing.
alter table public.job_posting_snapshots disable trigger user;
alter table public.analysis_results disable trigger user;
alter table public.analysis_step_executions disable trigger user;
alter table public.analysis_job_events disable trigger user;
alter table public.interview_questions disable trigger user;
alter table public.interview_answers disable trigger user;

delete from public.slack_job_threads where owner_id = '${owner}'::uuid;
delete from public.slack_notifications where owner_id = '${owner}'::uuid;
delete from public.interview_notes where owner_id = '${owner}'::uuid;
delete from public.interview_answers where owner_id = '${owner}'::uuid;
delete from public.interview_checklist_items where owner_id = '${owner}'::uuid;
delete from public.analysis_requirement_reviews where owner_id = '${owner}'::uuid;
delete from public.analysis_reviews where owner_id = '${owner}'::uuid;
delete from public.interview_questions where owner_id = '${owner}'::uuid;
delete from public.analysis_results where owner_id = '${owner}'::uuid;
delete from public.analysis_step_executions where owner_id = '${owner}'::uuid;
delete from public.analysis_job_events where owner_id = '${owner}'::uuid;
delete from public.analysis_jobs where owner_id = '${owner}'::uuid;
delete from public.job_posting_analysis_profiles where owner_id = '${owner}'::uuid;
delete from public.job_posting_collection_runs where owner_id = '${owner}'::uuid;
delete from public.job_posting_snapshots where owner_id = '${owner}'::uuid;
delete from public.application_status_history where owner_id = '${owner}'::uuid;
delete from public.application_documents where owner_id = '${owner}'::uuid;
delete from public.api_idempotency_records where owner_id = '${owner}'::uuid;
delete from public.applications where owner_id = '${owner}'::uuid;
delete from public.job_postings where owner_id = '${owner}'::uuid;

alter table public.job_posting_snapshots enable trigger user;
alter table public.analysis_results enable trigger user;
alter table public.analysis_step_executions enable trigger user;
alter table public.analysis_job_events enable trigger user;
alter table public.interview_questions enable trigger user;
alter table public.interview_answers enable trigger user;

commit;
`;
writeFileSync(sqlPath, sql, { mode: 0o600 });
try {
  execFileSync(
    "pnpm",
    ["exec", "supabase", "db", "query", "--linked", "--file", sqlPath],
    { stdio: "inherit" },
  );
} finally {
  try {
    readFileSync(sqlPath);
    await import("node:fs").then(({ unlinkSync }) => unlinkSync(sqlPath));
  } catch {
    // The temporary SQL contains the administrator UUID and is best-effort removed.
  }
}

console.log("\n취업 준비 데이터 초기화를 완료했습니다. 관리자·문서·Storage는 삭제하지 않았습니다.");
const verifySql = `
select jsonb_build_object(
  'adminUsers', (select count(*) from auth.users where id = '${owner}'::uuid),
  'jobPostings', (select count(*) from public.job_postings where owner_id = '${owner}'::uuid),
  'applications', (select count(*) from public.applications where owner_id = '${owner}'::uuid),
  'analysisJobs', (select count(*) from public.analysis_jobs where owner_id = '${owner}'::uuid),
  'collectionRuns', (select count(*) from public.job_posting_collection_runs where owner_id = '${owner}'::uuid),
  'slackNotifications', (select count(*) from public.slack_notifications where owner_id = '${owner}'::uuid),
  'documentVersions', (select count(*) from public.document_versions where owner_id = '${owner}'::uuid),
  'publications', (select count(*) from public.document_publications where owner_id = '${owner}'::uuid),
  'analysisProfiles', (select count(*) from public.document_analysis_profiles where owner_id = '${owner}'::uuid)
) as reset_verification;
`;
console.log(query(verifySql, "관리자·문서 보존과 취업 준비 데이터 초기화 결과 확인").trim());
