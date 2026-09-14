import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";

const root = new URL("../", import.meta.url).pathname;
const safeBuildEnvironment = {
  ...process.env,
  ADMIN_USER_ID: "00000000-0000-4000-8000-000000000001",
  NEXT_PUBLIC_CLIENT_URL: "http://localhost:3000",
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_offline_fixture",
  NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:55321",
  NEXT_PUBLIC_WORKER_API_URL: "http://localhost:8787",
};

function run(command, args, options = {}) {
  console.log(
    `\n[verify:offline] ${options.label ?? [command, ...args].join(" ")}`,
  );
  const result = spawnSync(command, args, {
    cwd: root,
    encoding: options.capture ? "utf8" : undefined,
    env: options.env ?? process.env,
    stdio: options.capture ? "pipe" : "inherit",
  });
  if (result.status !== 0) {
    if (options.capture && result.stderr) process.stderr.write(result.stderr);
    throw new Error(`${command} 실행에 실패했습니다.`);
  }
  return options.capture ? result.stdout : "";
}

function commandAvailable(command, args = ["--version"]) {
  const result = spawnSync(command, args, { cwd: root, stdio: "ignore" });
  if (result.status !== 0)
    throw new Error(`${command} 명령을 사용할 수 없습니다.`);
}

const nodeMajor = Number(process.versions.node.split(".")[0]);
if (nodeMajor < 20) throw new Error("Node.js 20 이상이 필요합니다.");
commandAvailable("pnpm");
commandAvailable("docker", ["info"]);
run("pnpm", ["exec", "supabase", "--version"], { label: "Supabase CLI 확인" });

let startedSupabase = false;
try {
  run("node", ["scripts/check-repository-security.mjs"]);
  run("docker", [
    "compose",
    "--env-file",
    "apps/n8n/.env.example",
    "-f",
    "apps/n8n/compose.yml",
    "config",
    "--quiet",
  ]);
  run("pnpm", ["check-types"]);
  run("pnpm", ["lint"]);
  run("pnpm", ["test"]);
  run("pnpm", ["--filter", "worker", "check-generated-types"]);
  run("pnpm", ["build"], { env: safeBuildEnvironment });

  const status = spawnSync(
    "pnpm",
    ["exec", "supabase", "status", "-o", "json"],
    {
      cwd: root,
      stdio: "ignore",
    },
  );
  if (status.status !== 0) {
    run("pnpm", ["exec", "supabase", "start"]);
    startedSupabase = true;
  }

  run("pnpm", ["exec", "supabase", "db", "reset", "--local"]);
  run("pnpm", ["db:lint:local"]);
  run("pnpm", ["db:test:local"]);

  const generatedTypes = run(
    "pnpm",
    [
      "exec",
      "supabase",
      "gen",
      "types",
      "typescript",
      "--local",
      "--schema",
      "public",
    ],
    { capture: true, label: "로컬 DB 타입 동기화 확인" },
  )
    .replaceAll("\r\n", "\n")
    .trimEnd();
  const committedTypes = readFileSync(
    new URL("../packages/contracts/src/database.types.ts", import.meta.url),
    "utf8",
  )
    .replaceAll("\r\n", "\n")
    .trimEnd();
  if (generatedTypes !== committedTypes) {
    throw new Error("커밋된 DB 타입이 로컬 migration 결과와 다릅니다.");
  }

  run("git", ["diff", "--check"]);
  console.log("\n외부 Credential 없는 전체 검증을 통과했습니다.");
} finally {
  if (startedSupabase) {
    run("pnpm", ["exec", "supabase", "stop"], {
      label: "검증 스크립트가 시작한 Supabase 종료",
    });
  }
}
