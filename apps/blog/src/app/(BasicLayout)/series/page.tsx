import { Suspense } from "react";
import type { Metadata, NextPage } from "next";

import { getAllPosts } from "#/libs/post";
import { getSharedMetadata } from "#/libs";

import SeriesAccordions from "#/app/(BasicLayout)/series/_components/SeriesAccordions";

const allPosts = getAllPosts();

export const metadata: Metadata = getSharedMetadata({
  title: "블로그 시리즈",
  description: "프론트엔드 개발자 박상은의 블로그 시리즈",
});

const Page: NextPage = () => {
  return (
    <Suspense>
      <SeriesAccordions allPosts={allPosts} />
    </Suspense>
  );
};

export default Page;
