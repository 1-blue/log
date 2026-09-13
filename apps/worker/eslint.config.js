import { config } from "@workspace/eslint-config/base";

/** @type {import("eslint").Linter.Config} */
export default [
  ...config,
  { ignores: [".wrangler/**", "dist/**", "worker-configuration.d.ts"] },
];
