import type { JobPostingSourceMetadata } from "@workspace/contracts";

import { isRecord, nullableString } from "./wanted-parser-support.js";

function hasJobPostingType(value: Record<string, unknown>): boolean {
  const type = value["@type"];
  return (
    type === "JobPosting" ||
    (Array.isArray(type) && type.includes("JobPosting"))
  );
}

function findJobPosting(
  value: unknown,
  depth = 0,
): Record<string, unknown> | null {
  if (depth > 8) return null;
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = findJobPosting(item, depth + 1);
      if (found) return found;
    }
    return null;
  }
  if (!isRecord(value)) return null;
  if (hasJobPostingType(value)) return value;
  if (value["@graph"] !== undefined) {
    const found = findJobPosting(value["@graph"], depth + 1);
    if (found) return found;
  }
  return null;
}

function extractJsonLd(html: string): unknown[] {
  const values: unknown[] = [];
  const scriptPattern = /<script\b([^>]*)>([\s\S]*?)<\/script\s*>/gi;
  for (const match of html.matchAll(scriptPattern)) {
    const attributes = match[1] ?? "";
    if (!/\btype\s*=\s*(["'])application\/ld\+json\1/i.test(attributes)) {
      continue;
    }
    try {
      values.push(JSON.parse((match[2] ?? "").trim()));
    } catch {
      // Other valid JSON-LD scripts may still contain the JobPosting object.
    }
  }
  return values;
}

export function findJsonLdJobPosting(
  html: string,
): Record<string, unknown> | null {
  return (
    extractJsonLd(html)
      .map((value) => findJobPosting(value))
      .find((value) => value !== null) ?? null
  );
}

function locationText(value: unknown): string | null {
  if (typeof value === "string") return nullableString(value, 1_000);
  const locations = Array.isArray(value) ? value : [value];
  const parts = locations.flatMap((location) => {
    if (!isRecord(location)) return [];
    const address = isRecord(location.address) ? location.address : location;
    return [
      address.streetAddress,
      address.addressLocality,
      address.addressRegion,
      address.addressCountry,
    ].flatMap((item) => {
      const text = nullableString(item, 300);
      return text ? [text] : [];
    });
  });
  return parts.length ? [...new Set(parts)].join(", ").slice(0, 1_000) : null;
}

export function metadataFromPosting(
  posting: Record<string, unknown>,
): JobPostingSourceMetadata {
  const organization = isRecord(posting.hiringOrganization)
    ? posting.hiringOrganization
    : null;
  const employmentType = Array.isArray(posting.employmentType)
    ? posting.employmentType
        .filter((item) => typeof item === "string")
        .join(", ")
    : posting.employmentType;

  return {
    companyName: nullableString(organization?.name, 500),
    datePosted: nullableString(posting.datePosted, 100),
    employmentType: nullableString(employmentType, 300),
    industry: nullableString(posting.industry, 500),
    location: locationText(posting.jobLocation),
    occupationalCategory: nullableString(posting.occupationalCategory, 500),
    title: nullableString(posting.title, 500),
    validThrough: nullableString(posting.validThrough, 100),
  };
}
