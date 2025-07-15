import type { Metadata } from "next";
import dayjs from "dayjs";

import { getAllPosts } from "#/libs/post";
import { getSharedMetadata } from "#/libs";

import PostSection from "#/app/(BasicLayout)/_components/sections/PostSection";

export const metadata: Metadata = getSharedMetadata();

const allPosts = getAllPosts();
const latestSortedPosts = allPosts.sort(
  (a, b) => dayjs(b.publishedAt).unix() - dayjs(a.publishedAt).unix(),
);
const Page: React.FC = () => {
  return (
    <article className="mx-auto my-8 flex max-w-7xl flex-col gap-6">
      <PostSection title="최근 포스팅" posts={latestSortedPosts} />
    </article>
  );
};

export default Page;
