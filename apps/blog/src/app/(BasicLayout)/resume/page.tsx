import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { getSharedMetadata } from "#/libs";
import { getPublishedDocumentUrl } from "#/libs/public-document-server";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  ...getSharedMetadata({
    description: "프론트엔드 개발자 박상은의 최신 공개 이력서입니다.",
    title: "이력서",
  }),
  alternates: { canonical: "/resume" },
  robots: {
    follow: false,
    index: false,
    noarchive: true,
    nocache: true,
  },
};

export default async function ResumePage() {
  const result = await getPublishedDocumentUrl("resume");
  if (result.url) redirect(result.url);

  return (
    <section className="mx-auto my-16 max-w-xl px-4 text-center">
      <h1 className="text-2xl font-bold">이력서를 열 수 없습니다.</h1>
      <p className="text-muted-foreground mt-3 text-sm">
        현재 공개된 이력서가 없거나 잠시 후 다시 시도해야 합니다.
      </p>
    </section>
  );
}
