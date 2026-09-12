import type { Metadata } from "next";

import PublicDocumentPage from "#/app/(BasicLayout)/_components/PublicDocumentPage";
import { getSharedMetadata } from "#/libs";

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

export default function ResumePage() {
  return (
    <PublicDocumentPage
      description="관리자가 공개 대상으로 지정한 최신 이력서를 확인할 수 있습니다."
      documentType="resume"
      title="이력서"
    />
  );
}
