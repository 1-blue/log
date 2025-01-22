declare namespace NodeJS {
  interface ProcessEnv {
    /** 실행 타입 */
    readonly NODE_ENV: "development" | "production" | "test";

    /** 배포 `URL` */
    readonly NEXT_PUBLIC_CLIENT_URL: string;
  }
}
