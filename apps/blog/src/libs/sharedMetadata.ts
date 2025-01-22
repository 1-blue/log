import type { Metadata } from "next";

const sharedTitle: Metadata["title"] = {
  template: "%s | 박상은 블로그",
  default: "박상은 블로그",
};
const sharedDescription = `프론트엔드 개발자 박상은의 블로그\n개발만이 아닌 여러가지 지식을 공유합니다.`;
const sharedKeywords = [
  "프론트엔드",
  "개발자",
  "박상은",
  "블로그",
  "포트폴리오",
  "이력서",
  "1-blue",
];
const sharedImages = ["/images/default/preview.jpg"];

interface GetSharedMetadataArgs {
  title?: Metadata["title"];
  description?: string;
  keywords?: string[];
  images?: string[];
}

/** 공용으로 사용할 메타데이터 */
export const getSharedMetadata = ({
  title = sharedTitle,
  description = sharedDescription,
  keywords = sharedKeywords,
  images = sharedImages,
}: GetSharedMetadataArgs = {}): Metadata => ({
  metadataBase: new URL(process.env.NEXT_PUBLIC_CLIENT_URL),
  title,
  description,
  keywords: [...new Set([...sharedKeywords, ...keywords])],
  openGraph: {
    title: title ?? sharedTitle,
    description,
    images,
    type: "website",
    url: process.env.NEXT_PUBLIC_CLIENT_URL,
    siteName: "프론트엔드 개발자 박상은의 블로그",
    locale: "ko_KR",
    countryName: "Korea",
  },
  twitter: {
    card: "summary_large_image",
    title: title ?? sharedTitle,
    description,
    images,
  },
});
