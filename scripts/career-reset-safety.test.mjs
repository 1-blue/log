import { test } from "node:test";
import assert from "node:assert/strict";
import {
  assertResetArguments,
  assertVerifiedBackup,
  assertResumeSafe,
  hash,
} from "./career-reset-safety.mjs";
const owner = "00000000-0000-4000-8000-000000000001";
const sql = Buffer.from("DB backup fixture"),
  pdf = Buffer.from("%PDF-backup fixture");
const manifest = () => ({
  version: 1,
  projectRef: "fixture",
  ownerId: owner,
  restoreVerified: true,
  fingerprint: "a".repeat(64),
  databaseHash: hash(sql),
  files: [
    {
      storagePath: `${owner}/resume/document.pdf`,
      backupFile: "pdfs/0.pdf",
      hash: hash(pdf),
      size: pdf.length,
    },
  ],
});
const read = (path) => (path === "public-data.sql" ? sql : pdf);
test("dry-run is the default, and malformed/combined apply arguments are rejected", () => {
  assert.doesNotThrow(() => assertResetArguments([]));
  assert.throws(() => assertResetArguments(["--apply", "--prepare-backup"]));
  assert.throws(() => assertResetArguments(["--confirm"]));
  assert.throws(() => assertResetArguments(["--force"]));
  assert.doesNotThrow(() => assertResetArguments(["--preserve-documents"]));
  assert.throws(() =>
    assertResetArguments(["--preserve-documents", "--include-documents"]),
  );
});
test("a full-reset backup cannot authorize a document-preserving reset or vice versa", () => {
  assert.throws(() =>
    assertVerifiedBackup(manifest(), "fixture", owner, read, "job_reset"),
  );
  const m = {
    ...manifest(),
    targetType: "job_reset",
    preservedFingerprint: "b".repeat(64),
  };
  assert.doesNotThrow(() =>
    assertVerifiedBackup(m, "fixture", owner, read, "job_reset"),
  );
  assert.throws(() => assertVerifiedBackup(m, "fixture", owner, read));
  assert.throws(() =>
    assertVerifiedBackup(
      { ...m, preservedFingerprint: null },
      "fixture",
      owner,
      read,
      "job_reset",
    ),
  );
});
test("verified backup binds the exact project, owner and byte hashes", () => {
  assert.doesNotThrow(() =>
    assertVerifiedBackup(manifest(), "fixture", owner, read),
  );
  assert.throws(() => assertVerifiedBackup(manifest(), "other", owner, read));
  assert.throws(() =>
    assertVerifiedBackup(
      { ...manifest(), restoreVerified: false },
      "fixture",
      owner,
      read,
    ),
  );
  assert.throws(() =>
    assertVerifiedBackup(manifest(), "fixture", owner, () =>
      Buffer.from("corrupt"),
    ),
  );
});
test("path traversal, cross-owner paths, duplicates and wrong sizes never reach deletion", () => {
  for (const change of [
    { backupFile: "../../secret.pdf" },
    { storagePath: "another/portfolio/file.pdf" },
    { storagePath: `${owner}/portfolio/../file.pdf` },
    { size: pdf.length + 1 },
  ]) {
    const m = manifest();
    Object.assign(m.files[0], change);
    assert.throws(() => assertVerifiedBackup(m, "fixture", owner, read));
  }
  const m = manifest();
  m.files.push({ ...m.files[0] });
  assert.throws(() => assertVerifiedBackup(m, "fixture", owner, read));
});
test("resuming an old operation may clean PDFs, never new business data", () => {
  assert.doesNotThrow(() =>
    assertResumeSafe({ applications: 0, document_versions: 0 }, { id: "old" }),
  );
  assert.throws(() => assertResumeSafe({ applications: 1 }, { id: "old" }));
});
