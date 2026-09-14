import {
  AnalysisWorkspaceSchema,
  calculateAnalysisFitScore,
} from "@workspace/contracts";

import { describe, expect, it } from "vitest";

import {
  ANALYSIS_PREVIEW_SCENARIOS,
  getAnalysisWorkspaceFixture,
} from "#/fixtures/analysis-workspace";

describe("analysis workspace fixtures", () => {
  it.each(ANALYSIS_PREVIEW_SCENARIOS)(
    "keeps the %s preview aligned with the public contract",
    (scenario) => {
      expect(
        AnalysisWorkspaceSchema.safeParse(getAnalysisWorkspaceFixture(scenario))
          .success,
      ).toBe(true);
    },
  );

  it("calculates a separate reviewed score without changing the AI score", () => {
    const fixture = getAnalysisWorkspaceFixture("mixed");
    const result = fixture.job.result!;
    const overrides = new Map(
      fixture.review.requirements.map((review) => [
        review.requirementId,
        review.overrideStatus,
      ]),
    );
    const reviewed = calculateAnalysisFitScore(
      result.job.requirements,
      result.comparison.matches.map((match) => ({
        ...match,
        status: overrides.get(match.requirementId) ?? match.status,
      })),
    );

    expect(result.fitScore).toBe(53);
    expect(reviewed).toBe(78);
    expect(fixture.reviewedFitScore).toBe(reviewed);
  });

  it("keeps preview mutations isolated between fixture calls", () => {
    const first = getAnalysisWorkspaceFixture("mixed");
    first.checklist[0]!.content = "변경";
    const second = getAnalysisWorkspaceFixture("mixed");
    expect(second.checklist[0]!.content).not.toBe("변경");
  });
});
