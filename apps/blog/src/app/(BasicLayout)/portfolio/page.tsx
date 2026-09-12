import type { Metadata } from "next";

import PublicDocumentPage from "#/app/(BasicLayout)/_components/PublicDocumentPage";
import { getSharedMetadata } from "#/libs";

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

export default function PortfolioPage() {
  return (
    <PublicDocumentPage
      description="관리자가 공개 대상으로 지정한 최신 포트폴리오를 확인할 수 있습니다."
      documentType="portfolio"
      title="포트폴리오"
    />
  );
}
