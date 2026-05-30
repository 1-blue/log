import type { Metadata } from "next";

import PostSection from "#/app/(BasicLayout)/_components/sections/PostSection";
import { getSharedMetadata } from "#/libs";
import { dayjs } from "#/libs/dayjs";
import { getAiPostsOnly } from "#/libs/post";

export const metadata: Metadata = getSharedMetadata({
  title: "AI 포스팅",
  description: "AI가 작성한 기술 블로그 포스팅 모음",
});

const allPosts = getAiPostsOnly();
const latestSortedPosts = allPosts.sort(
  (a, b) =>
    dayjs.tz(b.createdAt, "Asia/Seoul").unix() -
    dayjs.tz(a.createdAt, "Asia/Seoul").unix(),
);

const Page: React.FC = () => {
  return (
    <article className="mx-auto my-8 flex max-w-7xl flex-col gap-6">
      <PostSection title="AI 포스팅" posts={latestSortedPosts} />
    </article>
  );
};

export default Page;
