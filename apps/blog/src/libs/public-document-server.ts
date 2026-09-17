import {
  type DocumentType,
  PublicDocumentAccessResponseSchema,
} from "@workspace/contracts";

import { getWorkerApiUrl } from "#/libs/env";

export async function getPublishedDocumentUrl(
  documentType: DocumentType,
): Promise<{ status: number; url: string | null }> {
  try {
    const response = await fetch(
      new URL(
        `/v1/public/document-publications/${documentType}?disposition=inline`,
        getWorkerApiUrl(),
      ),
      { cache: "no-store", headers: { Accept: "application/json" } },
    );

    if (!response.ok) return { status: response.status, url: null };

    const parsed = PublicDocumentAccessResponseSchema.safeParse(
      await response.json().catch(() => null),
    );
    return parsed.success
      ? { status: response.status, url: parsed.data.data.url }
      : { status: 502, url: null };
  } catch {
    return { status: 503, url: null };
  }
}
