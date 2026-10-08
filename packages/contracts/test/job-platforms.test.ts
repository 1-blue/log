import { describe, expect, it } from "vitest";

import {
  canAutomaticallyCollectJobUrl,
  canonicalJobPostingUrl,
  detectJobPlatform,
  jobPlatformLabel,
  JobPostingUrlSchema,
} from "../src/job-platforms";

describe("platform detection and safe job identities", () => {
  it("detects exact host boundaries and prioritizes Jumpit over Saramin", () => {
    expect(detectJobPlatform("https://jumpit.saramin.co.kr/position/1")).toBe(
      "jumpit",
    );
    expect(
      detectJobPlatform(
        "https://www.saramin.co.kr/zf_user/jobs/relay/view?rec_idx=1",
      ),
    ).toBe("saramin");
    expect(detectJobPlatform("https://wanted.co.kr.evil.com/wd/1")).toBe(
      "other",
    );
    expect(detectJobPlatform("https://careers.company.com/jobs/1")).toBe(
      "other",
    );
    expect(
      jobPlatformLabel("other", "https://careers.company.com/jobs/1"),
    ).toBe("기타 · careers.company.com");
  });
  it("rejects credentialed, non-HTTPS, IP and local URLs", () => {
    for (const url of [
      "http://wanted.co.kr/wd/1",
      "https://user:secret@wanted.co.kr/wd/1",
      "https://127.0.0.1/job",
      "https://[::1]/job",
      "https://server.internal/job",
      "https://localhost/job",
      "https://example.com:8443/job",
    ]) {
      expect(JobPostingUrlSchema.safeParse(url).success).toBe(false);
    }
  });
  it("retains identity query parameters and strips only known tracking parameters", () => {
    expect(
      canonicalJobPostingUrl(
        "https://www.saramin.co.kr/jobs?utm_source=test&rec_idx=17&b=2&a=1",
      ),
    ).toBe("https://www.saramin.co.kr/jobs?a=1&b=2&rec_idx=17");
    expect(
      canonicalJobPostingUrl("https://wanted.co.kr/wd/12/?utm_medium=email"),
    ).toBe("https://www.wanted.co.kr/wd/12");
  });
  it("accepting a URL does not authorize arbitrary outbound fetching", () => {
    expect(canAutomaticallyCollectJobUrl("https://www.wanted.co.kr/wd/1")).toBe(
      true,
    );
    expect(
      canAutomaticallyCollectJobUrl("https://careers.company.com/job"),
    ).toBe(false);
    expect(
      canAutomaticallyCollectJobUrl(
        "https://www.wanted.co.kr/wd/1?redirect=https://127.0.0.1",
      ),
    ).toBe(false);
  });
});
