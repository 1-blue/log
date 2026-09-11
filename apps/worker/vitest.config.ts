import { cloudflareTest } from "@cloudflare/vitest-plugin";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [
    cloudflareTest({
      wrangler: { configPath: "./wrangler.jsonc" },
      miniflare: {
        bindings: {
          ADMIN_USER_ID: "00000000-0000-0000-0000-000000000000",
          APP_BASE_URL: "http://localhost:3000",
          N8N_CALLBACK_SECRET: "test-callback-secret",
          N8N_WEBHOOK_SECRET: "test-webhook-secret",
          N8N_WEBHOOK_URL: "http://localhost:5678/webhook/career-analysis",
          SLACK_ERROR_WEBHOOK_URL: "https://hooks.slack.com/services/test",
          SUPABASE_SECRET_KEY: "sb_secret_test",
          SUPABASE_URL: "https://example.supabase.co"
        }
      }
    })
  ],
  test: {
    include: ["test/**/*.test.ts"]
  }
});
