import { Suspense } from "react";
import type { Metadata, NextPage } from "next";

import { getAllPosts } from "#/libs/post";
import { getSharedMetadata } from "#/libs";

import SeriesAccordion from "#/app/(home)/series/_components/SeriesAccordion";

const allPosts = getAllPosts();

export const metadata: Metadata = getSharedMetadata({
  title: "블로그 시리즈",
  description: "프론트엔드 개발자 박상은의 블로그 시리즈",
});

// FIXME: Suspense 처리
const Page: NextPage = () => {
  return (
    <Suspense>
      <SeriesAccordion allPosts={allPosts} />
    </Suspense>
  );
};

export default Page;
