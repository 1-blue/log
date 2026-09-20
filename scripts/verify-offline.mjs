import { spawnSync } from "node:child_process";
import {
  cpSync,
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import prettier from "prettier";

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

function normalizeDatabaseTypes(source) {
  // Supabase CLI adds this client-generation metadata only when the local
  // PostgREST version exposes it. It is not part of the database schema and
  // can differ between the linked project and the disposable verifier.
  source = source.replace(
    /\n  \/\/ Allows to automatically instantiate createClient with right options\n  \/\/ instead of createClient<Database, \{ PostgrestVersion: 'XX' \}>\(URL, KEY\)\n  __InternalSupabase: \{\n    PostgrestVersion: "[^"]+";\n  \};\n/,
    "\n",
  );
  const marker = "Functions: {";
  const markerIndex = source.indexOf(marker);
  if (markerIndex < 0) return source;
  const openingBrace = source.indexOf("{", markerIndex);
  let depth = 0;
  let closingBrace = -1;
  for (let index = openingBrace; index < source.length; index += 1) {
    if (source[index] === "{") depth += 1;
    if (source[index] === "}") depth -= 1;
    if (depth === 0) {
      closingBrace = index;
      break;
    }
  }
  if (closingBrace < 0) return source;

  const entries = [];
  let entry = "";
  depth = 0;
  for (const line of source.slice(openingBrace + 1, closingBrace).split("\n")) {
    entry += `${line}\n`;
    for (const character of line) {
      if (character === "{") depth += 1;
      if (character === "}") depth -= 1;
    }
    if (depth === 0 && entry.trim()) {
      entries.push(entry);
      entry = "";
    }
  }
  if (entry.trim()) entries.push(entry);
  entries.sort((left, right) => left.localeCompare(right));

  return `${source.slice(0, openingBrace + 1)}${entries.join("")}${source.slice(closingBrace)}`;
}

const nodeMajor = Number(process.versions.node.split(".")[0]);
if (nodeMajor < 20) throw new Error("Node.js 20 이상이 필요합니다.");
commandAvailable("pnpm");
commandAvailable("docker", ["info"]);
run("pnpm", ["exec", "supabase", "--version"], { label: "Supabase CLI 확인" });

let isolatedSupabaseDir = null;
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

  // Never reset the developer's existing Supabase instance. A disposable
  // project id also prevents Docker volumes from sharing application data.
  isolatedSupabaseDir = mkdtempSync(join(tmpdir(), "career-ops-supabase-"));
  const isolatedSupabaseProjectDir = join(isolatedSupabaseDir, "supabase");
  cpSync(join(root, "supabase"), isolatedSupabaseProjectDir, {
    recursive: true,
    filter: (source) => !source.includes(`${join("supabase", ".temp")}`),
  });
  cpSync(
    join(root, "supabase", "tests"),
    join(isolatedSupabaseProjectDir, "tests"),
    {
      recursive: true,
    },
  );
  const isolatedConfigPath = join(isolatedSupabaseProjectDir, "config.toml");
  let isolatedConfig = readFileSync(isolatedConfigPath, "utf8");
  isolatedConfig = isolatedConfig
    .replace(/^project_id\s*=.*$/m, 'project_id = "career-ops-verify"')
    .replace(/^port\s*=\s*55321$/m, "port = 56321")
    .replace(/^port\s*=\s*55322$/m, "port = 56322")
    .replace(/^shadow_port\s*=\s*55320$/m, "shadow_port = 56320")
    .replace(/^port\s*=\s*55323$/m, "port = 56323")
    .replace(/^port\s*=\s*55324$/m, "port = 56324");
  writeFileSync(isolatedConfigPath, isolatedConfig);

  // The offline checks exercise SQL migrations and pgTAP only. Starting the
  // API, Studio, PostgREST, and other services would download unrelated
  // images and can collide with a developer's existing Supabase project.
  run("pnpm", [
    "exec",
    "supabase",
    "start",
    "--exclude",
    "gotrue,realtime,storage-api,imgproxy,kong,mailpit,postgrest,postgres-meta,studio,edge-runtime,logflare,vector,supavisor",
    "--workdir",
    isolatedSupabaseDir,
  ]);
  startedSupabase = true;

  run("pnpm", [
    "exec",
    "supabase",
    "db",
    "reset",
    "--local",
    "--workdir",
    isolatedSupabaseDir,
  ]);
  run("pnpm", [
    "exec",
    "supabase",
    "db",
    "lint",
    "--local",
    "--schema",
    "public",
    "--level",
    "warning",
    "--fail-on",
    "error",
    "--workdir",
    isolatedSupabaseDir,
  ]);
  run("pnpm", [
    "exec",
    "supabase",
    "test",
    "db",
    join(isolatedSupabaseProjectDir, "tests", "database"),
    "--workdir",
    isolatedSupabaseDir,
  ]);

  const generatedTypes = normalizeDatabaseTypes(
    await prettier.format(
      run(
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
          "--workdir",
          isolatedSupabaseDir,
        ],
        { capture: true, label: "로컬 DB 타입 동기화 확인" },
      ),
      { parser: "typescript" },
    ),
  );
  const committedTypes = normalizeDatabaseTypes(
    await prettier.format(
      readFileSync(
        new URL("../packages/contracts/src/database.types.ts", import.meta.url),
        "utf8",
      ),
      { parser: "typescript" },
    ),
  );
  if (generatedTypes !== committedTypes) {
    throw new Error("커밋된 DB 타입이 로컬 migration 결과와 다릅니다.");
  }

  run("git", ["diff", "--check"]);
  console.log("\n외부 Credential 없는 전체 검증을 통과했습니다.");
} finally {
  if (startedSupabase && isolatedSupabaseDir) {
    run("pnpm", ["exec", "supabase", "stop", "--workdir", isolatedSupabaseDir], {
      label: "검증 스크립트가 시작한 Supabase 종료",
    });
  }
  if (isolatedSupabaseDir && existsSync(isolatedSupabaseDir)) {
    rmSync(isolatedSupabaseDir, { recursive: true, force: true });
  }
}
