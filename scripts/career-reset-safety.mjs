import { createHash } from "node:crypto";

export const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");
export function assertResetArguments(args) {
  const switches = new Set([
    "--include-documents",
    "--preserve-documents",
    "--apply",
    "--prepare-backup",
  ]);
  const values = new Set(["--backup", "--confirm"]);
  for (let index = 0; index < args.length; index++) {
    if (switches.has(args[index])) continue;
    if (
      values.has(args[index]) &&
      args[index + 1] &&
      !args[index + 1].startsWith("--")
    ) {
      index++;
      continue;
    }
    throw new Error("알 수 없거나 값이 빠진 초기화 옵션입니다.");
  }
  if (args.includes("--apply") && args.includes("--prepare-backup"))
    throw new Error("백업 준비와 실제 삭제는 별도 명령으로 실행하세요.");
  if (
    args.includes("--include-documents") &&
    args.includes("--preserve-documents")
  )
    throw new Error(
      "문서 포함 초기화와 문서 보존 초기화는 함께 지정할 수 없습니다.",
    );
}
export function assertVerifiedBackup(
  manifest,
  projectRef,
  ownerId,
  readBackup,
  targetType = "reset",
) {
  const sha = /^[0-9a-f]{64}$/;
  if (
    manifest.version !== 1 ||
    manifest.projectRef !== projectRef ||
    manifest.ownerId !== ownerId ||
    manifest.restoreVerified !== true ||
    !sha.test(manifest.fingerprint) ||
    !sha.test(manifest.databaseHash) ||
    !Array.isArray(manifest.files) ||
    (manifest.targetType ?? "reset") !== targetType ||
    (targetType === "job_reset" && !sha.test(manifest.preservedFingerprint))
  )
    throw new Error("대상 프로젝트의 검증된 백업이 아닙니다.");
  if (hash(readBackup("public-data.sql")) !== manifest.databaseHash)
    throw new Error("DB 백업 해시가 다릅니다.");
  const paths = new Set(),
    files = new Set();
  for (const file of manifest.files) {
    const parts =
      typeof file.storagePath === "string" ? file.storagePath.split("/") : [];
    if (
      !/^pdfs\/\d+\.pdf$/.test(file.backupFile) ||
      parts.length !== 3 ||
      parts[0] !== ownerId ||
      !["resume", "portfolio"].includes(parts[1]) ||
      !parts[2].endsWith(".pdf") ||
      parts[2].includes("..") ||
      paths.has(file.storagePath) ||
      files.has(file.backupFile) ||
      !sha.test(file.hash) ||
      !Number.isInteger(file.size) ||
      file.size < 1
    )
      throw new Error("잘못된 PDF 백업 manifest입니다.");
    const bytes = readBackup(file.backupFile);
    if (bytes.length !== file.size || hash(bytes) !== file.hash)
      throw new Error("PDF 백업 크기 또는 해시가 다릅니다.");
    paths.add(file.storagePath);
    files.add(file.backupFile);
  }
}
export function assertResumeSafe(counts, existingOperation) {
  if (existingOperation && Object.values(counts).some((count) => count !== 0))
    throw new Error(
      "이전 초기화 이후 새 데이터가 있습니다. 이전 백업으로 재실행할 수 없습니다.",
    );
}
