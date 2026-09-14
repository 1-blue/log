import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const nextConfig = readFileSync(
  new URL("../../next.config.mjs", import.meta.url),
  "utf8",
);
const supabaseConfig = readFileSync(
  new URL("../../../../supabase/config.toml", import.meta.url),
  "utf8",
);

describe("deployment security configuration", () => {
  it.each([
    ["X-Content-Type-Options", "nosniff"],
    ["X-Frame-Options", "DENY"],
    ["Referrer-Policy", "strict-origin-when-cross-origin"],
    ["Permissions-Policy", "camera=(), microphone=(), geolocation=()"],
  ])("defines the %s response header", (name, value) => {
    expect(nextConfig).toContain(`key: "${name}"`);
    expect(nextConfig).toContain(`value: "${value}"`);
  });

  it("keeps local public signup disabled like production", () => {
    expect(
      supabaseConfig.match(/enable_signup = false/g)?.length,
    ).toBeGreaterThanOrEqual(2);
    expect(supabaseConfig).not.toMatch(/^enable_signup = true$/m);
  });
});
