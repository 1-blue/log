import type { MatchStatus } from "@workspace/contracts";

export type ReviewDraft = Record<
  string,
  { note: string; overrideStatus: MatchStatus | "" }
>;
