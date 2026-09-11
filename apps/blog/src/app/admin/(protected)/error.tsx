"use client";

import { Button } from "@workspace/ui/components/Button";

import { CircleAlertIcon } from "lucide-react";

export default function AdminError({ reset }: { reset: () => void }) {
  return (
    <section className="border-destructive/30 bg-destructive/5 mx-auto max-w-xl rounded-lg border p-8 text-center">
      <CircleAlertIcon
        aria-hidden="true"
        className="text-destructive mx-auto size-8"
      />
      <h2 className="mt-4 text-lg font-semibold">
        관리자 화면을 불러오지 못했습니다.
      </h2>
      <p className="text-muted-foreground mt-2 text-sm">
        네트워크와 환경 설정을 확인한 뒤 다시 시도해 주세요.
      </p>
      <Button className="mt-6" onClick={reset} type="button">
        다시 시도
      </Button>
    </section>
  );
}
