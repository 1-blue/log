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

  it("normalizes every nested object for Structured Outputs", () => {
    const source = {
      type: "object",
      properties: {
        nested: {
          type: "object",
          properties: {
            value: { type: "string" },
          },
        },
      },
      required: ["nested"],
      additionalProperties: false,
    };

    expect(toOpenAiStructuredOutputSchema(source)).toEqual({
      type: "object",
      properties: {
        nested: {
          type: "object",
          properties: {
            value: { type: "string" },
          },
          required: ["value"],
          additionalProperties: false,
        },
      },
      required: ["nested"],
      additionalProperties: false,
    });
  });

  it("keeps base-model constraints when explicitly requested for job structuring", () => {
    const source = z.toJSONSchema(
      z.strictObject({
        id: z.uuid(),
        evidence: z.array(z.string().min(1).max(500)).min(1).max(30),
      }),
      { target: "draft-07" },
    );
    const adapted = toOpenAiStructuredOutputSchema(source, {
      preserveValidationConstraints: true,
    });
    expect(adapted).toMatchObject({
      properties: {
        id: { format: "uuid", pattern: expect.any(String) },
        evidence: {
          minItems: 1,
          maxItems: 30,
          items: { minLength: 1, maxLength: 500 },
        },
      },
    });
    expect(adapted).not.toHaveProperty("$schema");
    expect(source).toHaveProperty("$schema");
    expect(toOpenAiStructuredOutputSchema(source)).not.toHaveProperty(
      "properties.evidence.maxItems",
    );
  });
});
