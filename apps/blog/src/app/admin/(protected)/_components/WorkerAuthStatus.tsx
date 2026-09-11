"use client";

import { useEffect, useState } from "react";

import {
  CircleAlertIcon,
  CircleCheckIcon,
  LoaderCircleIcon,
} from "lucide-react";

import { getWorkerAdminSession, WorkerApiError } from "#/libs/worker-client";

type ConnectionState =
  | { kind: "error"; message: string }
  | { kind: "loading" }
  | { kind: "ready" };

function getErrorMessage(error: unknown): string {
  if (error instanceof WorkerApiError) {
    if (error.status === 401) {
      return "세션을 갱신하지 못했습니다. 다시 로그인해 주세요.";
    }
    if (error.status === 403) {
      return "Worker 관리자 권한을 확인하지 못했습니다.";
    }
  }

  return "Worker에 연결하지 못했습니다. 환경 설정과 실행 상태를 확인해 주세요.";
}

export default function WorkerAuthStatus() {
  const [state, setState] = useState<ConnectionState>({ kind: "loading" });

  useEffect(() => {
    let active = true;

    getWorkerAdminSession()
      .then(() => {
        if (active) setState({ kind: "ready" });
      })
      .catch((error: unknown) => {
        if (active) {
          setState({ kind: "error", message: getErrorMessage(error) });
        }
      });

    return () => {
      active = false;
    };
  }, []);

  if (state.kind === "loading") {
    return (
      <span className="text-muted-foreground inline-flex items-center gap-2 text-sm">
        <LoaderCircleIcon aria-hidden="true" className="size-4 animate-spin" />
        Worker 인증 확인 중
      </span>
    );
  }

  if (state.kind === "error") {
    return (
      <span className="text-destructive inline-flex items-start gap-2 text-sm">
        <CircleAlertIcon
          aria-hidden="true"
          className="mt-0.5 size-4 shrink-0"
        />
        {state.message}
      </span>
    );
  }

  return (
    <span className="inline-flex items-center gap-2 text-sm text-emerald-600 dark:text-emerald-400">
      <CircleCheckIcon aria-hidden="true" className="size-4" />
      Worker 관리자 인증 연결됨
    </span>
  );
}
