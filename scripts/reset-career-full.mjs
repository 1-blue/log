import { execFileSync } from "node:child_process";
import {
  assertResetArguments,
  assertVerifiedBackup,
  assertResumeSafe,
  hash,
} from "./career-reset-safety.mjs";
import {
  mkdirSync,
  readFileSync,
  writeFileSync,
  chmodSync,
  existsSync,
} from "node:fs";
import { createRequire } from "node:module";
import { join, resolve } from "node:path";

const root = new URL("../", import.meta.url).pathname;
const args = process.argv.slice(2);
assertResetArguments(args);
const apply = args.includes("--apply"),
  prepare = args.includes("--prepare-backup");
const value = (name) =>
  args.includes(name) ? args[args.indexOf(name) + 1] : null;
const ownerId = process.env.ADMIN_USER_ID;
if (
  !ownerId ||
  !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    ownerId,
  )
)
  throw new Error("ADMIN_USER_ID에 관리자 UUID를 지정하세요.");
if (apply && prepare)
  throw new Error("백업 준비와 실제 삭제는 별도 명령으로 실행하세요.");
const projectRef = readFileSync(
  join(root, "supabase/.temp/project-ref"),
  "utf8",
).trim();
if (!/^[a-z0-9]+$/.test(projectRef))
  throw new Error("연결 프로젝트를 확인하지 못했습니다.");
const confirmation = `${projectRef}:${ownerId}`;
const safeCommand = (command, commandArgs, options) => {
  try {
    return execFileSync(command, commandArgs, options);
  } catch {
    throw new Error(
      "관리 명령 실행 실패: 민감한 명령 출력은 표시하지 않습니다.",
    );
  }
};
const query = (sql) => {
  const raw = safeCommand(
    "pnpm",
    ["exec", "supabase", "db", "query", "--linked", sql, "--output", "json"],
    { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
  );
  const result = JSON.parse(raw.slice(raw.indexOf("{")));
  if (!Array.isArray(result.rows))
    throw new Error("DB 응답을 확인하지 못했습니다.");
  return result.rows;
};
const preview = () =>
  query(
    `select public.preview_career_deletion('${ownerId}'::uuid,'reset',null) as preview`,
  )[0].preview;
const protectedWrite = (path, content) => {
  writeFileSync(path, content, { mode: 0o600 });
  chmodSync(path, 0o600);
};
const current = preview();
console.log(
  JSON.stringify(
    {
      projectRef,
      ownerId,
      scope: "Career Ops 기록·문서·공개 설정·PDF",
      counts: current.counts,
      blockers: current.blockers,
    },
    null,
    2,
  ),
);
const settings = { ...process.env };
const envPath = join(root, "apps/worker/.env");
if (existsSync(envPath))
  for (const line of readFileSync(envPath, "utf8").split("\n")) {
    const match = line.match(/^([A-Z_][A-Z0-9_]*)\s*=\s*(.*)$/);
    if (match && !settings[match[1]])
      settings[match[1]] = match[2].trim().replace(/^(['"])(.*)\1$/, "$2");
  }
const { createClient } = createRequire(
  new URL("../apps/worker/package.json", import.meta.url),
)("@supabase/supabase-js");
if (!settings.SUPABASE_URL || !settings.SUPABASE_SECRET_KEY)
  throw new Error("Storage 확인에 필요한 Supabase 설정이 없습니다.");
if (new URL(settings.SUPABASE_URL).hostname !== `${projectRef}.supabase.co`)
  throw new Error(
    "Worker Storage 설정과 연결 DB 프로젝트가 다릅니다. 실행을 중단했습니다.",
  );
const client = createClient(
  settings.SUPABASE_URL,
  settings.SUPABASE_SECRET_KEY,
  { auth: { persistSession: false, autoRefreshToken: false } },
);
const bucket = client.storage.from("career-documents");
const rpc = async (name, input) => {
  const { data, error } = await client.rpc(name, input);
  if (error)
    throw new Error(`관리 작업 ${name} 실패: 원문 오류는 비공개입니다.`);
  return data;
};
const listObjects = async () => {
  const paths = [];
  for (const type of ["resume", "portfolio"]) {
    for (let offset = 0; ; offset += 100) {
      const { data, error } = await bucket.list(`${ownerId}/${type}`, {
        limit: 100,
        offset,
        sortBy: { column: "name", order: "asc" },
      });
      if (error) throw new Error("PDF 목록을 확인하지 못했습니다.");
      for (const object of data) {
        if (
          !object.id ||
          !object.name.endsWith(".pdf") ||
          object.name.includes("/") ||
          object.name.includes("..")
        )
          throw new Error("예상하지 못한 Storage 경로가 있습니다.");
        paths.push(`${ownerId}/${type}/${object.name}`);
      }
      if (data.length < 100) break;
    }
  }
  return paths.sort();
};
const paths = await listObjects();
console.log(
  JSON.stringify({ pdfCount: paths.length, pdfPaths: paths }, null, 2),
);
if (!prepare && !apply) {
  console.log(
    "실제 삭제를 실행하지 않았습니다. --prepare-backup으로 백업을 준비하세요.",
  );
  process.exit(0);
}
if (!current.allowed)
  throw new Error(
    "실행 중인 작업이 있어 중단했습니다. 작업 종료 후 재시도하세요.",
  );
if (apply && value("--confirm") !== confirmation)
  throw new Error("--confirm <projectRef:ownerId> 확인 문자열이 필요합니다.");
let backupDir, manifest;
if (apply) {
  if (!value("--backup"))
    throw new Error("검증된 백업 디렉터리를 --backup으로 지정하세요.");
  backupDir = resolve(value("--backup"));
  manifest = JSON.parse(readFileSync(join(backupDir, "manifest.json"), "utf8"));
  assertVerifiedBackup(manifest, projectRef, ownerId, (path) =>
    readFileSync(join(backupDir, path)),
  );
}
let deletionStarted = false,
  maintenanceAcquired = false;
const existingReset = () =>
  apply
    ? query(
        `select id,status from public.career_deletion_operations where owner_id='${ownerId}'::uuid and target_type='reset' and fingerprint='${manifest.fingerprint}'`,
      )[0]
    : null;
const priorOperation = existingReset();
const wasMaintenance =
  query(
    `select enabled from public.career_ops_maintenance where owner_id='${ownerId}'::uuid`,
  )[0]?.enabled ?? false;
if (wasMaintenance && (!apply || !priorOperation))
  throw new Error(
    "이미 유지보수 잠금이 있습니다. 기존 초기화 작업의 복구가 아닌 실행은 중단합니다.",
  );
assertResumeSafe(current.counts, priorOperation);
try {
  if (!wasMaintenance)
    await rpc("set_career_maintenance", {
      p_owner_id: ownerId,
      p_enabled: true,
    });
  maintenanceAcquired = true;
  const frozen = preview();
  if (prepare) {
    backupDir = join(
      root,
      ".local/career-ops-backups",
      new Date().toISOString().replaceAll(/[:.]/g, "-"),
    );
    mkdirSync(join(backupDir, "pdfs"), { recursive: true, mode: 0o700 });
    chmodSync(backupDir, 0o700);
    chmodSync(join(backupDir, "pdfs"), 0o700);
    safeCommand(
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
        join(backupDir, "public-data.sql"),
      ],
      { cwd: root, stdio: ["ignore", "pipe", "pipe"] },
    );
    chmodSync(join(backupDir, "public-data.sql"), 0o600);
    const files = [];
    for (const [index, path] of (await listObjects()).entries()) {
      const { data, error } = await bucket.download(path);
      if (error || !data) throw new Error("PDF 백업 다운로드 실패");
      const bytes = Buffer.from(await data.arrayBuffer()),
        backupFile = `pdfs/${index}.pdf`;
      protectedWrite(join(backupDir, backupFile), bytes);
      files.push({
        storagePath: path,
        backupFile,
        size: bytes.length,
        hash: hash(bytes),
      });
    }
    const documents = query(
      `select storage_path,content_hash,file_size from public.document_versions where owner_id='${ownerId}'::uuid`,
    );
    for (const document of documents) {
      const file = files.find(
        (file) => file.storagePath === document.storage_path,
      );
      if (
        !file ||
        file.hash !== document.content_hash ||
        file.size !== Number(document.file_size)
      )
        throw new Error("등록 문서와 PDF 백업이 일치하지 않습니다.");
    }
    manifest = {
      version: 1,
      projectRef,
      ownerId,
      fingerprint: frozen.fingerprint,
      counts: frozen.counts,
      files,
      authUserIds: query("select id from auth.users").map((row) => row.id),
      databaseHash: hash(readFileSync(join(backupDir, "public-data.sql"))),
      restoreVerified: false,
      createdAt: new Date().toISOString(),
    };
    protectedWrite(
      join(backupDir, "manifest.json"),
      JSON.stringify(manifest, null, 2),
    );
    safeCommand(
      process.execPath,
      [join(root, "scripts/verify-career-db.mjs"), "--restore", backupDir],
      { cwd: root, stdio: "inherit" },
    );
    if (preview().fingerprint !== frozen.fingerprint)
      throw new Error("백업 중 데이터가 변경됐습니다.");
    manifest.restoreVerified = true;
    protectedWrite(
      join(backupDir, "manifest.json"),
      JSON.stringify(manifest, null, 2),
    );
    console.log(
      JSON.stringify(
        {
          backupDir,
          restoreVerified: true,
          counts: manifest.counts,
          pdfCount: files.length,
          confirmation,
        },
        null,
        2,
      ),
    );
    console.log(
      "백업 준비만 완료했습니다. 삭제 대상과 백업을 확인한 뒤 별도로 --apply를 실행하세요.",
    );
  } else {
    const existing = existingReset();
    if (existing && Object.values(frozen.counts).some((count) => count !== 0))
      throw new Error(
        "이전 초기화 이후 새 데이터가 있습니다. 실행을 중단합니다.",
      );
    if (!existing && frozen.fingerprint !== manifest.fingerprint)
      throw new Error("백업 이후 데이터가 변경됐습니다. 새 백업이 필요합니다.");
    if (!existing) {
      if (
        JSON.stringify(await listObjects()) !==
        JSON.stringify(manifest.files.map((file) => file.storagePath).sort())
      )
        throw new Error("백업 이후 PDF 목록이 변경됐습니다.");
      for (const file of manifest.files) {
        const { data, error } = await bucket.download(file.storagePath);
        if (
          error ||
          !data ||
          hash(Buffer.from(await data.arrayBuffer())) !== file.hash
        )
          throw new Error("백업 이후 PDF가 변경됐습니다.");
      }
    }
    const operation =
      existing ??
      (await rpc("delete_career_resource", {
        p_owner_id: ownerId,
        p_target_type: "reset",
        p_target_id: null,
        p_fingerprint: manifest.fingerprint,
      }));
    deletionStarted = true;
    manifest.operationId = operation.id;
    protectedWrite(
      join(backupDir, "manifest.json"),
      JSON.stringify(manifest, null, 2),
    );
    await rpc("enqueue_career_reset_objects", {
      p_owner_id: ownerId,
      p_operation_id: operation.id,
      p_paths: manifest.files.map((file) => file.storagePath),
    });
    for (let pass = 0; pass < 10; pass++) {
      const tasks = await rpc("claim_career_storage_cleanup", {
        p_owner_id: ownerId,
        p_limit: 100,
      });
      if (!tasks.length) break;
      for (const task of tasks) {
        if (!task.storage_path.startsWith(`${ownerId}/`))
          throw new Error("삭제 대상 PDF 소유자가 다릅니다.");
        const { error } = await bucket.remove([task.storage_path]);
        await rpc("finish_career_storage_cleanup", {
          p_owner_id: ownerId,
          p_cleanup_id: task.id,
          p_attempt: task.attempts,
          p_success: !error,
        });
      }
    }
    const remaining = preview(),
      pdfs = await listObjects();
    const admin = query(
      `select count(*)::integer as count from auth.users where id='${ownerId}'::uuid`,
    )[0].count;
    const pending = query(
      `select count(*)::integer as count from public.career_storage_cleanup where owner_id='${ownerId}'::uuid and status <> 'completed'`,
    )[0].count;
    if (
      admin !== 1 ||
      pdfs.length ||
      pending ||
      Object.values(remaining.counts).some((count) => count !== 0)
    )
      throw new Error(
        "리셋이 일부 완료됐습니다. 유지보수 잠금과 백업을 보존합니다. 같은 --apply 명령으로 재시도하세요.",
      );
    console.log(
      JSON.stringify(
        {
          resetCompleted: true,
          adminPreserved: true,
          remaining: remaining.counts,
          pdfsRemaining: 0,
          backupDir,
        },
        null,
        2,
      ),
    );
  }
  await rpc("set_career_maintenance", {
    p_owner_id: ownerId,
    p_enabled: false,
  });
  maintenanceAcquired = false;
} finally {
  // An ambiguous network failure after the DB commit must not release the lock.
  if (
    maintenanceAcquired &&
    !deletionStarted &&
    !wasMaintenance &&
    !existingReset()
  )
    await rpc("set_career_maintenance", {
      p_owner_id: ownerId,
      p_enabled: false,
    });
}
