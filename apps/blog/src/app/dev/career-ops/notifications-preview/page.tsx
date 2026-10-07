import { notFound } from "next/navigation";

import NotificationsPreview from "./preview";
export const metadata = {
  robots: { index: false, follow: false },
  title: "Slack 알림 복구 미리보기",
};
export default function Page() {
  // eslint-disable-next-line turbo/no-undeclared-env-vars
  if (process.env.NODE_ENV === "production") notFound();
  return (
    <main className="mx-auto max-w-6xl p-6">
      <p className="mb-6 text-sm">
        개발 전용 가상 데이터 · 실제 Slack 메시지를 보내지 않습니다.
      </p>
      <NotificationsPreview />
    </main>
  );
}
