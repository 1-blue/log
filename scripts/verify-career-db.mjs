import { spawnSync, execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { cpSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createServer } from "node:net";

const root = new URL("../", import.meta.url).pathname;
const taskDir = mkdtempSync(join(tmpdir(), "career-delete-db-"));
cpSync(join(root, "supabase"), join(taskDir, "supabase"), {
  recursive: true,
  filter: (path) => !path.includes("/.temp"),
});
const projectId = `career-delete-${randomUUID().slice(0, 8)}`;
let config = readFileSync(
  join(taskDir, "supabase/config.toml"),
  "utf8",
).replace(/^project_id\s*=.*$/m, `project_id = "${projectId}"`);
for (const oldPort of [55321, 55322, 55320, 55323, 55324]) {
  const server = createServer();
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const port = server.address().port;
  await new Promise((resolve) => server.close(resolve));
  config = config.replace(
    new RegExp(`(port\\s*=\\s*)${oldPort}\\b`, "g"),
    `$1${port}`,
  );
}
writeFileSync(join(taskDir, "supabase/config.toml"), config);
const run = (args, capture = false) => {
  const result = spawnSync(
    "pnpm",
    ["exec", "supabase", ...args, "--workdir", taskDir],
    { cwd: root, encoding: "utf8", stdio: capture ? "pipe" : "inherit" },
  );
  if (result.status !== 0)
    throw new Error(capture ? result.stderr : "DB verification failed");
  return result.stdout;
};
console.log(`[career-db] isolated workdir ${taskDir}`);
try {
  run([
    "start",
    "--exclude",
    "gotrue,realtime,storage-api,imgproxy,kong,mailpit,postgrest,postgres-meta,studio,edge-runtime,logflare,vector,supavisor",
  ]);
  run(["db", "reset", "--local"]);
  const restoreIndex = process.argv.indexOf("--restore");
  if (restoreIndex >= 0) {
    const backupDir = process.argv[restoreIndex + 1];
    const manifest = JSON.parse(
      readFileSync(join(backupDir, "manifest.json"), "utf8"),
    );
    const users = manifest.authUserIds
      .map((id) => {
        if (!/^[0-9a-f-]{36}$/i.test(id))
          throw new Error("Invalid backup owner");
        return `insert into auth.users(id) values('${id}'::uuid) on conflict do nothing;`;
      })
      .join("\n");
    const sql = `set session_replication_role = 'replica';\n${users}\n${readFileSync(join(backupDir, "public-data.sql"), "utf8")}\nset session_replication_role = 'origin';`;
    const restored = spawnSync(
      "docker",
      [
        "exec",
        "-i",
        `supabase_db_${projectId}`,
        "psql",
        "-U",
        "postgres",
        "-d",
        "postgres",
        "-v",
        "ON_ERROR_STOP=1",
      ],
      { input: sql, encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] },
    );
    if (restored.status !== 0)
      throw new Error(
        "백업 복원에 실패했습니다. 민감한 SQL 원문은 출력하지 않습니다.",
      );
    const raw = execFileSync(
      "docker",
      [
        "exec",
        `supabase_db_${projectId}`,
        "psql",
        "-U",
        "postgres",
        "-d",
        "postgres",
        "-Atc",
        `select public.preview_career_deletion('${manifest.ownerId}'::uuid,'reset',null)::text`,
      ],
      { encoding: "utf8" },
    );
    if (JSON.parse(raw).fingerprint !== manifest.fingerprint)
      throw new Error("복원 데이터가 백업 전 데이터와 다릅니다.");
    console.log(
      "[career-db] DB 백업 복원과 전체 삭제 대상 fingerprint 대조 완료",
    );
    // Existing pgTAP fixtures assume empty tables. Keep their tests separate from
    // the restored-data comparison, and reset only this disposable project.
    run(["db", "reset", "--local"]);
  }
  if (process.argv.includes("--generate-types")) {
    writeFileSync(
      join(root, "packages/contracts/src/database.types.ts"),
      run(
        ["gen", "types", "typescript", "--local", "--schema", "public"],
        true,
      ),
    );
  }
  run([
    "db",
    "lint",
    "--local",
    "--schema",
    "public",
    "--level",
    "warning",
    "--fail-on",
    "error",
  ]);
  run(["test", "db", join(taskDir, "supabase/tests/database")]);
} finally {
  run(["stop", "--no-backup"]);
}
