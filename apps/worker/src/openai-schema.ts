const OPENAI_UNSUPPORTED_SCHEMA_KEYS = new Set([
  "$schema",
  "allOf",
  "dependentRequired",
  "dependentSchemas",
  "else",
  "format",
  "if",
  "maxItems",
  "maxLength",
  "maximum",
  "minItems",
  "minLength",
  "minimum",
  "multipleOf",
  "not",
  "pattern",
  "patternProperties",
  "then",
]);

function sanitize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sanitize);
  if (value === null || typeof value !== "object") return value;

  const sanitized = Object.fromEntries(
    Object.entries(value)
      .filter(([key]) => !OPENAI_UNSUPPORTED_SCHEMA_KEYS.has(key))
      .map(([key, nested]) => [key, sanitize(nested)]),
  );

  // Structured Outputs requires every object property to be required and
  // rejects undeclared properties. Zod currently emits this shape for the
  // contracts, but enforcing it here keeps future schemas safe as well.
  if (
    sanitized.type === "object" &&
    sanitized.properties &&
    typeof sanitized.properties === "object" &&
    !Array.isArray(sanitized.properties)
  ) {
    sanitized.required = Object.keys(sanitized.properties);
    sanitized.additionalProperties = false;
  }

  return sanitized;
}

/**
 * Converts the full contract JSON Schema into the supported Structured
 * Outputs subset. Runtime Zod validation remains the final authority after
 * the model response is returned.
 */
export function toOpenAiStructuredOutputSchema(
  schema: unknown,
): Record<string, unknown> {
  const sanitized = sanitize(schema);
  if (
    sanitized === null ||
    typeof sanitized !== "object" ||
    Array.isArray(sanitized)
  ) {
    throw new Error("OpenAI structured output schema must be an object");
  }
  return sanitized as Record<string, unknown>;
}

export function findOpenAiUnsupportedSchemaKeys(schema: unknown): string[] {
  const found = new Set<string>();

  const visit = (value: unknown): void => {
    if (Array.isArray(value)) {
      value.forEach(visit);
      return;
    }
    if (value === null || typeof value !== "object") return;
    for (const [key, nested] of Object.entries(value)) {
      if (OPENAI_UNSUPPORTED_SCHEMA_KEYS.has(key)) found.add(key);
      visit(nested);
    }
  };

  visit(schema);
  return [...found].sort();
}
