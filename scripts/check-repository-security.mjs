import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { basename, join } from "node:path";

const repositoryRoot = new URL("../", import.meta.url).pathname;

function fail(message) {
  throw new Error(message);
}

function read(relativePath) {
  return readFileSync(join(repositoryRoot, relativePath), "utf8");
}

const repositoryFiles = execFileSync(
  "git",
  ["ls-files", "--cached", "--others", "--exclude-standard", "-z"],
  {
    cwd: repositoryRoot,
    encoding: "utf8",
  },
)
  .split("\0")
  .filter(Boolean);

for (const path of repositoryFiles) {
  const name = basename(path);
  if (
    (name === ".env" || name.startsWith(".env.")) &&
    !name.endsWith(".example")
  ) {
    fail(`실제 환경변수 파일이 Git에 추적되고 있습니다: ${path}`);
  }
  if (name.startsWith(".dev.vars") && !name.endsWith(".example")) {
    fail(`실제 Wrangler 변수 파일이 Git에 추적되고 있습니다: ${path}`);
  }
}

const secretPatterns = [
  ["OpenAI API key", /\bsk-(?:proj-)?[A-Za-z0-9_-]{20,}\b/g],
  [
    "Slack Incoming Webhook",
    /https:\/\/hooks\.slack\.com\/services\/[A-Z0-9]{8,}\/[A-Z0-9]{8,}\/[A-Za-z0-9]{20,}/g,
  ],
  ["Supabase secret key", /\bsb_secret_[A-Za-z0-9_-]{20,}\b/g],
  ["private key", /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/g],
  ["JWT", /\beyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\b/g],
];

for (const path of repositoryFiles) {
  if (path === "pnpm-lock.yaml") continue;
  const source = read(path);
  for (const [label, pattern] of secretPatterns) {
    pattern.lastIndex = 0;
    if (pattern.test(source))
      fail(`${label} 패턴이 추적 파일에 있습니다: ${path}`);
  }
}

const expectedVariables = {
  ".env.ci.example": [
    "CLOUDFLARE_ACCOUNT_ID",
    "CLOUDFLARE_API_TOKEN",
    "SUPABASE_ACCESS_TOKEN",
    "SUPABASE_PROJECT_REF",
    "SUPABASE_DB_PASSWORD",
  ],
  "apps/blog/.env.example": [
    "NEXT_PUBLIC_CLIENT_URL",
    "NEXT_PUBLIC_SUPABASE_URL",
    "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
    "ADMIN_USER_ID",
    "NEXT_PUBLIC_WORKER_API_URL",
  ],
  "apps/n8n/.env.example": [
    "N8N_ENCRYPTION_KEY",
    "POSTGRES_PASSWORD",
    "APP_BASE_URL",
    "WORKER_CALLBACK_URL",
    "WORKER_CALLBACK_SECRET",
    "WORKER_TO_N8N_SECRET",
    "SLACK_JOB_CHANNEL_ID",
    "SLACK_ERROR_WEBHOOK_URL",
  ],
  "apps/worker/.env.example": [
    "APP_BASE_URL",
    "SUPABASE_URL",
    "SUPABASE_SECRET_KEY",
    "ADMIN_USER_ID",
    "N8N_WEBHOOK_URL",
    "N8N_WEBHOOK_SECRET",
    "N8N_CALLBACK_SECRET",
    "SLACK_ERROR_WEBHOOK_URL",
  ],
};

for (const [path, expected] of Object.entries(expectedVariables)) {
  const lines = read(path).split(/\r?\n/);
  const variables = [];
  for (let index = 0; index < lines.length; index += 1) {
    const match = /^([A-Z][A-Z0-9_]*)=/.exec(lines[index]);
    if (!match) continue;
    variables.push(match[1]);
    let commentIndex = index - 1;
    while (commentIndex >= 0 && lines[commentIndex].trim() === "")
      commentIndex -= 1;
    if (commentIndex < 0 || !lines[commentIndex].trim().startsWith("#")) {
      fail(`${path}의 ${match[1]}에 역할 주석이 없습니다.`);
    }
  }
  if (JSON.stringify(variables) !== JSON.stringify(expected)) {
    fail(`${path} 환경변수 목록이 계약과 다릅니다.`);
  }
}

const compose = read("apps/n8n/compose.yml");
for (const required of [
  '"127.0.0.1:5678:5678"',
  'N8N_SSRF_PROTECTION_ENABLED: "true"',
  "N8N_SSRF_BLOCKED_IP_RANGES: default,100.64.0.0/10",
  "N8N_SSRF_ALLOWED_HOSTNAMES: host.docker.internal",
  "NODE_FUNCTION_ALLOW_BUILTIN: crypto",
  'N8N_DIAGNOSTICS_ENABLED: "false"',
  'N8N_COMMUNITY_PACKAGES_ENABLED: "false"',
  'N8N_PUBLIC_API_DISABLED: "true"',
  'N8N_TEMPLATES_ENABLED: "false"',
  'N8N_VERSION_NOTIFICATIONS_ENABLED: "false"',
]) {
  if (!compose.includes(required))
    fail(`n8n 보안 설정이 누락되었습니다: ${required}`);
}
const postgresService = compose.split("\n  n8n:")[0] ?? compose;
if (/\n    ports:/m.test(postgresService)) {
  fail("n8n PostgreSQL 포트가 호스트에 노출되어 있습니다.");
}

const workerConfig = read("apps/worker/wrangler.jsonc");
for (const requiredSecret of expectedVariables["apps/worker/.env.example"]) {
  if (!workerConfig.includes(`"${requiredSecret}"`)) {
    fail(`Wrangler required secret 선언이 누락되었습니다: ${requiredSecret}`);
  }
}

console.log("환경변수 template과 저장소 정적 보안 검사를 통과했습니다.");
