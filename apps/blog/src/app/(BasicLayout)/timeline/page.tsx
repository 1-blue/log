import type { Metadata, NextPage } from "next";

import { getAllPosts } from "#/libs/post";
import { dayjs } from "#/libs/dayjs";
import { getSharedMetadata } from "#/libs";

import Timeline from "#/app/(BasicLayout)/timeline/_components/Timeline";

const allPosts = getAllPosts();
const latestSortedPosts = allPosts.sort(
  (a, b) =>
    dayjs.tz(b.createdAt, "Asia/Seoul").unix() -
    dayjs.tz(a.createdAt, "Asia/Seoul").unix(),
);

export const metadata: Metadata = getSharedMetadata({
  title: "블로그 저장소",
  description: "프론트엔드 개발자 박상은의 블로그 저장소",
});

const Page: NextPage = () => {
  return (
    <section className="mx-auto my-8 max-w-7xl">
      <Timeline latestSortedPosts={latestSortedPosts} />
    </section>
  );
};

export default Page;
