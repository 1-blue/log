import { describe, expect, it } from "vitest";

import {
  JobPostingParseError,
  normalizeJobPostingText,
  parseManualJobPosting,
  parseWantedJobPosting,
} from "../src/wanted-parser.js";
// @ts-expect-error Vite loads committed HTML fixtures as source strings.
import invalidUrlFixture from "./fixtures/wanted-invalid-url.html?raw";
// @ts-expect-error Vite loads committed HTML fixtures as source strings.
import structureChangedFixture from "./fixtures/wanted-structure-changed.html?raw";
// @ts-expect-error Vite loads committed HTML fixtures as source strings.
import validGraphFixture from "./fixtures/wanted-valid-graph.html?raw";
// @ts-expect-error Vite loads committed HTML fixtures as source strings.
import validObjectFixture from "./fixtures/wanted-valid-object.html?raw";

const url = "https://www.wanted.co.kr/wd/384409";

const fixtures = {
  "wanted-invalid-url.html": invalidUrlFixture,
  "wanted-structure-changed.html": structureChangedFixture,
  "wanted-valid-graph.html": validGraphFixture,
  "wanted-valid-object.html": validObjectFixture,
};

function fixture(name: keyof typeof fixtures): string {
  return fixtures[name];
}

function html(value: unknown) {
  return `<!doctype html><html><head><script type="application/ld+json">${JSON.stringify(value)}</script></head></html>`;
}

const posting = {
  "@context": "https://schema.org",
  "@type": "JobPosting",
  description: "주요 업무<br>클라우드 운영\r\n\r\n\r\n자격 요건",
  employmentType: ["FULL_TIME"],
  hiringOrganization: { "@type": "Organization", name: "미리디" },
  jobLocation: {
    address: { addressLocality: "서울", addressRegion: "서울특별시" },
  },
  title: "ＡＸ Engineer - Infra",
  url,
};

describe("Wanted JobPosting parser", () => {
  it.each(["wanted-valid-object.html", "wanted-valid-graph.html"] as const)(
    "parses the committed %s regression fixture",
    (name) => {
      const result = parseWantedJobPosting({
        expectedUrl: url,
        html: fixture(name),
      });
      expect(result.sourceMetadata.companyName).toBe("미리디");
      expect(result.sourceMetadata.title).toBe("AX Engineer - Infra");
      expect(result.normalizedContent).toContain("클라우드");
    },
  );

  it.each([
    posting,
    [posting],
    {
      "@context": "https://schema.org",
      "@graph": [{ "@type": "Thing" }, posting],
    },
  ])("finds JobPosting in supported JSON-LD shapes", (value) => {
    const result = parseWantedJobPosting({
      expectedUrl: url,
      html: html(value),
    });
    expect(result.source).toBe("wanted_json_ld");
    expect(result.parserVersion).toBe("wanted-jsonld-v1");
    expect(result.sourceMetadata.title).toBe("AX Engineer - Infra");
    expect(result.normalizedContent).toContain("주요 업무\n클라우드 운영");
    expect(result.normalizedContent).not.toContain("\n\n\n");
  });

  it("ignores broken unrelated JSON-LD scripts", () => {
    const source = `<script type="application/ld+json">{broken</script>${html(posting)}`;
    expect(
      parseWantedJobPosting({ expectedUrl: url, html: source }).source,
    ).toBe("wanted_json_ld");
  });

  it.each([
    [fixture("wanted-structure-changed.html"), "PARSER_STRUCTURE_CHANGED"],
    [fixture("wanted-invalid-url.html"), "URL_MISMATCH"],
    [html({ ...posting, description: "" }), "INVALID_JOB_POSTING"],
  ])("classifies invalid structures", (source, code) => {
    try {
      parseWantedJobPosting({ expectedUrl: url, html: source });
      throw new Error("Expected parsing to fail");
    } catch (error) {
      expect(error).toBeInstanceOf(JobPostingParseError);
      expect((error as JobPostingParseError).code).toBe(code);
    }
  });

  it("normalizes manual text and validates its length", () => {
    const source = `  주요   업무\r\n\r\n\r\n${"클라우드 운영 경험 ".repeat(10)} `;
    const result = parseManualJobPosting(source);
    expect(result.source).toBe("manual");
    expect(result.normalizedContent).toBe(normalizeJobPostingText(source));
    try {
      parseManualJobPosting("짧은 공고");
      throw new Error("Expected parsing to fail");
    } catch (error) {
      expect(error).toBeInstanceOf(JobPostingParseError);
      expect((error as JobPostingParseError).code).toBe("INVALID_JOB_POSTING");
    }
  });

  it("keeps out-of-range numeric entities without crashing", () => {
    expect(normalizeJobPostingText("안전한 값 &#999999999999; 유지")).toBe(
      "안전한 값 &#999999999999; 유지",
    );
  });

  it("normalizes long Unicode content without losing section boundaries", () => {
    const description = `ＡＸ 주요 업무\n${"클라우드 자동화 경험  ".repeat(2_000)}\n\n자격 요건\nTypeScript`;
    const result = parseWantedJobPosting({
      expectedUrl: url,
      html: html({ ...posting, description }),
    });
    expect(result.normalizedContent).toContain("AX 주요 업무");
    expect(result.normalizedContent).toContain("\n\n자격 요건\n");
  });
});
