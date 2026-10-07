// The historical command remains a read-only preview. All mutations go through
// the backup-verified, owner-scoped reset workflow (never global trigger changes).
if (!process.argv.includes("--include-documents")) {
  console.log(
    "[career-reset] 문서·PDF를 포함한 전체 Career Ops dry-run입니다.",
  );
}
await import("./reset-career-full.mjs");
