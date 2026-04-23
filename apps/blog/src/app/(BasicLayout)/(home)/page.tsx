import type { Metadata } from "next";

import { getAllPosts } from "#/libs/post";
import { dayjs } from "#/libs/dayjs";
import { getSharedMetadata } from "#/libs";

import PostSection from "#/app/(BasicLayout)/_components/sections/PostSection";

export const metadata: Metadata = getSharedMetadata();

const allPosts = getAllPosts();
const latestSortedPosts = allPosts.sort(
  (a, b) =>
    dayjs.tz(b.createdAt, "Asia/Seoul").unix() -
    dayjs.tz(a.createdAt, "Asia/Seoul").unix(),
);
const Page: React.FC = () => {
  return (
    <article className="mx-auto my-8 flex max-w-7xl flex-col gap-6">
      <PostSection
        title="최근 포스팅"
        posts={latestSortedPosts}
        excludeTagToggle={{
          tag: "AI",
          label: "AI 포스팅 제외",
          defaultChecked: false,
          caseInsensitive: true,
        }}
      />
    </article>
  );
};

export default Page;
