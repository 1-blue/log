import { describe, expect, it } from "vitest";

import {
  JobPostingParseError,
  normalizeJobPostingText,
  parseAiExtractedJobPosting,
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
    expect(result.sections.mainResponsibilities).toContain("클라우드 운영");
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

  it("falls back to the visible Wanted HTML when JSON-LD is incomplete", () => {
    const source = `
      <html>
        <head>
          <link rel="canonical" href="${url}" />
          <title>Frontend Engineer | Wanted</title>
        </head>
        <body>
          <main>
            <a href="/company/scatterlab">스캐터랩</a>
            <h1>Frontend Engineer</h1>
            <h2>포지션 상세</h2>
            <p>주요 업무와 서비스 개발을 담당합니다.</p>
            <h2>자격 요건</h2>
            <p>${"TypeScript와 React를 활용한 개발 경험이 있습니다. ".repeat(5)}</p>
            <h2>우대 사항</h2>
            <p>클라우드와 자동화 경험을 우대합니다.</p>
          </main>
        </body>
      </html>`;

    const result = parseWantedJobPosting({ expectedUrl: url, html: source });

    expect(result.source).toBe("wanted_html");
    expect(result.parserVersion).toBe("wanted-html-v1");
    expect(result.sourceMetadata.companyName).toBe("스캐터랩");
    expect(result.sourceMetadata.title).toBe("Frontend Engineer");
    expect(result.normalizedContent).toContain("자격 요건");
  });

  it("prefers a longer validated visible body over a shortened JSON-LD description", () => {
    const source = `
      <html>
        <head>
          <link rel="canonical" href="${url}" />
          <script type="application/ld+json">${JSON.stringify({
            ...posting,
            description: "주요 업무 요약만 제공됩니다.",
          })}</script>
        </head>
        <body>
          <main>
            <a href="/company/mirid">미리디</a>
            <h1>ＡＸ Engineer - Infra</h1>
            <h2>주요 업무</h2>
            <p>${"인프라 자동화와 서비스 운영을 담당합니다. ".repeat(8)}</p>
            <h2>자격 요건</h2>
            <p>${"클라우드 환경에서 안정적인 서비스를 운영한 경험이 필요합니다. ".repeat(8)}</p>
            <h2>우대 사항</h2>
            <p>n8n과 TypeScript를 활용한 자동화 경험을 우대합니다.</p>
          </main>
        </body>
      </html>`;

    const result = parseWantedJobPosting({ expectedUrl: url, html: source });

    expect(result.source).toBe("wanted_html");
    expect(result.normalizedContent).toContain("자격 요건");
    expect(result.normalizedContent).toContain("우대 사항");
  });

  it("stops visible sections before Wanted navigation and footer text", () => {
    const source = `
      <html>
        <head>
          <link rel="canonical" href="${url}" />
          <title>Frontend Engineer | Wanted</title>
        </head>
        <body>
          <main>
            <a href="/company/scatterlab">스캐터랩</a>
            <h1>Frontend Engineer</h1>
            <h2>주요 업무</h2>
            <p>${"서비스를 안정적으로 운영하고 자동화합니다. ".repeat(8)}</p>
            <h2>자격 요건</h2>
            <p>${"TypeScript와 React를 활용한 개발 경험이 필요합니다. ".repeat(8)}</p>
            <h2>기술 스택</h2>
            <p>풀<br />태그</p>
            <h2>근무 지역</h2>
            <p>서울특별시 강남구</p>
            <p>더 많은 포지션을 찾아 볼까요?</p>
            <p>추천 포지션과 원티드 탐색 메뉴</p>
          </main>
        </body>
      </html>`;

    const result = parseWantedJobPosting({ expectedUrl: url, html: source });

    expect(result.sections.mainResponsibilities).not.toContain("추천 포지션");
    expect(result.sections.location).toBe("서울특별시 강남구");
    expect(result.sections.technologies).toBeNull();
    expect(result.normalizedContent).not.toContain("더 많은 포지션");
  });

  it("rejects an HTML fallback whose canonical URL points to another posting", () => {
    const source = `<main><link rel="canonical" href="https://www.wanted.co.kr/wd/1" /><h1>Frontend Engineer</h1><a href="/company/scatterlab">스캐터랩</a><h2>자격 요건</h2><p>${"충분한 공고 본문입니다. ".repeat(20)}</p></main>`;
    expect(() =>
      parseWantedJobPosting({ expectedUrl: url, html: source }),
    ).toThrowError(expect.objectContaining({ code: "URL_MISMATCH" }));
  });

  it("accepts AI extraction only when it contains source evidence", () => {
    const source = `<main><h1>Frontend Engineer</h1><a href="/company/scatterlab">스캐터랩</a><h2>자격 요건</h2><p>${"TypeScript와 React를 활용한 개발 경험이 있습니다. ".repeat(5)}</p></main>`;
    const result = parseAiExtractedJobPosting({
      expectedUrl: url,
      html: source,
      extraction: {
        companyName: "스캐터랩",
        description:
          "TypeScript와 React를 활용한 개발 경험이 있습니다. ".repeat(5),
        evidence: [{ section: "자격 요건", excerpt: "TypeScript와 React" }],
        title: "Frontend Engineer",
        warnings: [],
      },
    });

    expect(result.source).toBe("wanted_ai");
    expect(result.parserVersion).toBe("wanted-ai-v1");
  });

  it("rejects AI extraction without an exact source excerpt", () => {
    const source = `<main><h1>Frontend Engineer</h1><a href="/company/scatterlab">스캐터랩</a><h2>자격 요건</h2><p>${"TypeScript와 React를 활용한 개발 경험이 있습니다. ".repeat(5)}</p></main>`;
    expect(() =>
      parseAiExtractedJobPosting({
        expectedUrl: url,
        html: source,
        extraction: {
          companyName: "스캐터랩",
          description:
            "TypeScript와 React를 활용한 개발 경험이 있습니다. ".repeat(5),
          evidence: [{ section: "자격 요건", excerpt: "Python만 사용합니다." }],
          title: "Frontend Engineer",
          warnings: [],
        },
      }),
    ).toThrowError(expect.objectContaining({ code: "INVALID_JOB_POSTING" }));
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
