declare namespace NodeJS {
  interface ProcessEnv {
    /** 실행 타입 */
    readonly NODE_ENV: "development" | "production" | "test";

    /** 배포 `URL` */
    readonly NEXT_PUBLIC_CLIENT_URL: string;

    /** 브라우저와 서버가 연결할 Supabase 프로젝트 URL */
    readonly NEXT_PUBLIC_SUPABASE_URL: string;

    /** 브라우저용 Supabase Publishable key */
    readonly NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: string;

    /** 브라우저가 호출할 Cloudflare Worker API URL */
    readonly NEXT_PUBLIC_WORKER_API_URL: string;

    /** 관리자 접근을 허용할 Supabase Auth 사용자 UUID */
    readonly ADMIN_USER_ID: string;
  }
}
