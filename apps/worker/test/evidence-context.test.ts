import { describe, expect, it } from "vitest";

import { evidenceContext } from "../src/interview-workspace-mappers.js";
describe("source evidence context", () => {
  it("preserves paragraphs and linebreaks without borrowing the next project", () => {
    const text =
      "Career Ops\nCloudflare Workers 관리 API를 구현했습니다.\nn8n과 연결했습니다.\n\nstory-dict\nDocker로 배포했습니다.";
    const context = evidenceContext(
      text,
      "Cloudflare Workers 관리 API를 구현했습니다.",
    );
    expect(context).toBe(
      "Career Ops\nCloudflare Workers 관리 API를 구현했습니다.\nn8n과 연결했습니다.",
    );
    expect(context).not.toContain("story-dict");
  });
  it("does not cut the first character or fabricate an unmatched context", () => {
    expect(evidenceContext("첫 문장입니다.", "첫 문장입니다.")).toBe(
      "첫 문장입니다.",
    );
    expect(evidenceContext("원문", "없는 문장")).toBeNull();
  });
  it("explicitly marks omission in oversized paragraphs and keeps full sentences", () => {
    const source =
      "이전 문장입니다. ".repeat(1000) +
      "핵심 경험입니다. " +
      "다음 문장입니다. ".repeat(1000);
    const context = evidenceContext(source, "핵심 경험입니다.")!;
    expect(context).toContain("핵심 경험입니다.");
    expect(context).toContain("생략");
    expect(context.length).toBeLessThanOrEqual(4000);
  });
});
