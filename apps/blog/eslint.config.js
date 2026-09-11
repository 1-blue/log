import { nextJsConfig } from "@workspace/eslint-config/next-js";

/** @type {import("eslint").Linter.Config} */
export default [
  ...nextJsConfig,
  {
    rules: {
      // `next lint` runs from apps/blog, so eslint-plugin-turbo cannot discover
      // the root turbo.json declaration even though the task hashes this value.
      "turbo/no-undeclared-env-vars": [
        "warn",
        { allowList: ["^ADMIN_USER_ID$"] },
      ],
    },
  },
];
