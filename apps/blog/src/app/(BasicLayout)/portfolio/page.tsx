import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { getSharedMetadata } from "#/libs";
import { getPublishedDocumentUrl } from "#/libs/public-document-server";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  ...getSharedMetadata({
    description: "프론트엔드 개발자 박상은의 최신 공개 포트폴리오입니다.",
    title: "포트폴리오",
  }),
  alternates: { canonical: "/portfolio" },
  robots: {
    follow: false,
    index: false,
    noarchive: true,
    nocache: true,
  },
};

export default async function PortfolioPage() {
  const result = await getPublishedDocumentUrl("portfolio");
  if (result.url) redirect(result.url);

  return (
    <section className="mx-auto my-16 max-w-xl px-4 text-center">
      <h1 className="text-2xl font-bold">포트폴리오를 열 수 없습니다.</h1>
      <p className="text-muted-foreground mt-3 text-sm">
        현재 공개된 포트폴리오가 없거나 잠시 후 다시 시도해야 합니다.
      </p>
    </section>
  );
}
