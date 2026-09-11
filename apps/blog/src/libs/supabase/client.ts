"use client";

import type { Database } from "@workspace/contracts/database";

import { createBrowserClient } from "@supabase/ssr";

import { getSupabasePublicConfig } from "#/libs/env";

let browserClient: ReturnType<typeof createBrowserClient<Database>> | null =
  null;

export function createClient() {
  if (!browserClient) {
    const { publishableKey, url } = getSupabasePublicConfig();
    browserClient = createBrowserClient<Database>(url, publishableKey);
  }

  return browserClient;
}
