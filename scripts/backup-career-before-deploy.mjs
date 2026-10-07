// Non-destructive pre-migration backup. Reset approval uses the separate
// maintenance-locked, restore-verified manifest from reset-career-full.mjs.
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync, chmodSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";
import { hash } from "./career-reset-safety.mjs";
const root = new URL("../", import.meta.url).pathname;
const owner = process.env.ADMIN_USER_ID;
const ref = readFileSync(
  join(root, "supabase/.temp/project-ref"),
  "utf8",
).trim();
if (
  !owner ||
  !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
    owner,
  ) ||
  new URL(process.env.SUPABASE_URL).hostname !== `${ref}.supabase.co`
)
  throw new Error("백업 대상 프로젝트·관리자를 확인하세요.");
const { createClient } = createRequire(
  new URL("../apps/worker/package.json", import.meta.url),
)("@supabase/supabase-js");
const client = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SECRET_KEY,
  { auth: { persistSession: false, autoRefreshToken: false } },
);
const { data: admin, error: authError } =
  await client.auth.admin.getUserById(owner);
if (authError || admin.user?.id !== owner)
  throw new Error("관리자 계정 확인 실패");
const documents = await client
  .from("document_versions")
  .select("storage_path,content_hash,file_size")
  .eq("owner_id", owner);
if (documents.error) throw new Error("백업 대상 문서 확인 실패");
const dir = join(
  root,
  ".local/career-ops-backups",
  `before-deploy-${new Date().toISOString().replaceAll(/[:.]/g, "-")}`,
);
mkdirSync(join(dir, "pdfs"), { recursive: true, mode: 0o700 });
chmodSync(dir, 0o700);
chmodSync(join(dir, "pdfs"), 0o700);
for (const [name, args] of [
  ["schema.sql", ["--schema", "public,private"]],
  ["public-data.sql", ["--data-only", "--schema", "public"]],
]) {
  try {
    execFileSync(
      "pnpm",
      [
        "exec",
        "supabase",
        "db",
        "dump",
        "--linked",
        ...args,
        "--file",
        join(dir, name),
      ],
      { cwd: root, stdio: "pipe" },
    );
  } catch {
    throw new Error("DB 백업 실패: 민감한 출력은 비공개입니다.");
  }
  chmodSync(join(dir, name), 0o600);
}
const bucket = client.storage.from("career-documents"),
  files = [];
for (const type of ["resume", "portfolio"]) {
  for (let offset = 0; ; offset += 100) {
    const { data, error } = await bucket.list(`${owner}/${type}`, {
      offset,
      limit: 100,
      sortBy: { column: "name", order: "asc" },
    });
    if (error) throw new Error("PDF 목록 확인 실패");
    for (const file of data) {
      if (
        !file.id ||
        file.name.includes("/") ||
        file.name.includes("..") ||
        !file.name.endsWith(".pdf")
      )
        throw new Error("예상하지 못한 PDF 경로");
      const path = `${owner}/${type}/${file.name}`,
        download = await bucket.download(path);
      if (download.error || !download.data) throw new Error("PDF 백업 실패");
      const bytes = Buffer.from(await download.data.arrayBuffer()),
        backupFile = `pdfs/${files.length}.pdf`;
      writeFileSync(join(dir, backupFile), bytes, { mode: 0o600 });
      files.push({
        storagePath: path,
        backupFile,
        size: bytes.length,
        hash: hash(bytes),
      });
    }
    if (data.length < 100) break;
  }
}
for (const doc of documents.data) {
  const file = files.find((file) => file.storagePath === doc.storage_path);
  if (
    !file ||
    file.hash !== doc.content_hash ||
    file.size !== Number(doc.file_size)
  )
    throw new Error("등록 문서와 PDF 백업의 크기·해시 불일치");
}
const manifest = {
  version: 1,
  purpose: "pre-deployment",
  projectRef: ref,
  ownerId: owner,
  restoreVerified: false,
  files,
  schemaHash: hash(readFileSync(join(dir, "schema.sql"))),
  databaseHash: hash(readFileSync(join(dir, "public-data.sql"))),
  createdAt: new Date().toISOString(),
};
writeFileSync(join(dir, "manifest.json"), JSON.stringify(manifest, null, 2), {
  mode: 0o600,
});
console.log(
  JSON.stringify(
    {
      backupDir: dir,
      documentCount: documents.data.length,
      pdfCount: files.length,
      bytesVerified: true,
      restoreVerified: false,
      noDataDeleted: true,
    },
    null,
    2,
  ),
);
