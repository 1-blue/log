import { notFound } from "next/navigation";

import ApplicationPreview from "./preview";

export const metadata = {
  robots: { index: false, follow: false },
  title: "지원 상태 검증 미리보기",
};

export default function Page() {
  // eslint-disable-next-line turbo/no-undeclared-env-vars
  if (process.env.NODE_ENV === "production") notFound();
  return (
    <main className="mx-auto grid max-w-6xl gap-6 p-6">
      <h1 className="text-2xl font-bold">지원 상태 · 공고 정보 검증</h1>
      <p className="text-muted-foreground text-sm">
        개발 전용 가상 데이터입니다. 실제 API·DB·AI·Slack을 호출하지 않습니다.
      </p>
      <ApplicationPreview />
    </main>
  );
}
