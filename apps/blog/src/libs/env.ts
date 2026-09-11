function requireValue(value: string | undefined, name: string): string {
  if (!value) {
    throw new Error(`${name} 환경변수가 설정되지 않았습니다.`);
  }

  return value;
}

function requireUrl(value: string | undefined, name: string): string {
  const requiredValue = requireValue(value, name);

  try {
    return new URL(requiredValue).origin;
  } catch {
    throw new Error(`${name} 환경변수가 올바른 URL이 아닙니다.`);
  }
}

export function getSupabasePublicConfig() {
  return {
    publishableKey: requireValue(
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
      "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
    ),
    url: requireUrl(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      "NEXT_PUBLIC_SUPABASE_URL",
    ),
  };
}

export function getWorkerApiUrl(): string {
  return requireUrl(
    process.env.NEXT_PUBLIC_WORKER_API_URL,
    "NEXT_PUBLIC_WORKER_API_URL",
  );
}
