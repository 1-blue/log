import { describe, expect, it } from "vitest";
import * as z from "zod";

import {
  findOpenAiUnsupportedSchemaKeys,
  toOpenAiStructuredOutputSchema,
} from "../src/openai-schema.js";

describe("OpenAI Structured Outputs schema adapter", () => {
  it("removes unsupported JSON Schema validation keywords recursively", () => {
    const source = z.toJSONSchema(
      z.strictObject({
        title: z.string().min(1).max(100).nullable(),
        evidence: z
          .array(
            z.strictObject({
              excerpt: z.string().min(1).max(500),
            }),
          )
          .max(3),
      }),
      { target: "draft-07" },
    );

    expect(findOpenAiUnsupportedSchemaKeys(source)).toEqual([
      "$schema",
      "maxItems",
      "maxLength",
      "minLength",
    ]);

    const adapted = toOpenAiStructuredOutputSchema(source);
    expect(findOpenAiUnsupportedSchemaKeys(adapted)).toEqual([]);
    expect(adapted).toMatchObject({
      type: "object",
      required: ["title", "evidence"],
      additionalProperties: false,
    });
    expect(adapted).not.toHaveProperty("$schema");
    expect(adapted).toHaveProperty("properties.title.anyOf");
  });
});
