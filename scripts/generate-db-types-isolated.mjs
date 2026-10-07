// Generate types from migrations without touching the developer's database.
import { spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import {
  cpSync,
  mkdtempSync,
  readFileSync,
  writeFileSync,
  rmSync,
} from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import prettier from "prettier";

const directory = mkdtempSync(join(tmpdir(), "career-ops-types-"));
const cli = (args, capture = false) => {
  const result = spawnSync(
    "pnpm",
    ["exec", "supabase", ...args, "--workdir", directory],
    { encoding: "utf8", stdio: capture ? "pipe" : "inherit" },
  );
  if (result.status !== 0)
    throw new Error(
      capture ? result.stderr : "Isolated Supabase command failed",
    );
  return result.stdout;
};
const port = async () => {
  const server = createServer();
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const value = server.address().port;
  await new Promise((resolve) => server.close(resolve));
  return value;
};
try {
  cpSync("supabase", join(directory, "supabase"), {
    recursive: true,
    filter: (path) => !path.includes("/supabase/.temp"),
  });
  const path = join(directory, "supabase/config.toml");
  let config = readFileSync(path, "utf8").replace(
    /^project_id\s*=.*$/m,
    `project_id = "career-ops-types-${randomUUID().slice(0, 8)}"`,
  );
  for (const previous of [55320, 55321, 55322, 55323, 55324])
    config = config.replace(
      new RegExp(`= ${previous}$`, "m"),
      `= ${await port()}`,
    );
  writeFileSync(path, config);
  cli([
    "start",
    "--exclude",
    "gotrue,realtime,storage-api,imgproxy,kong,mailpit,postgrest,postgres-meta,studio,edge-runtime,logflare,vector,supavisor",
  ]);
  cli(["test", "db", join(directory, "supabase/tests/database")]);
  const generated = cli(
    ["gen", "types", "typescript", "--local", "--schema", "public"],
    true,
  );
  writeFileSync(
    "packages/contracts/src/database.types.ts",
    await prettier.format(generated, { parser: "typescript" }),
  );
  console.log(
    "Generated database types from isolated migrations and passed pgTAP.",
  );
} finally {
  cli(["stop"]);
  // This path was created by this process with mkdtemp, never a workspace root.
  rmSync(directory, { recursive: true, force: true });
}
