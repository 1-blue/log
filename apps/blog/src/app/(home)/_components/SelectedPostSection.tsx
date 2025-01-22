"use client";

import dayjs from "dayjs";

import { useCalendarStore } from "#/stores";
import type { IPostWithETC } from "#/types";

import PostSection from "#/app/(home)/_components/sections/PostSection";

interface Props {
  posts: IPostWithETC[];
}

const SelectedPostSection: React.FC<Props> = ({ posts }) => {
  const { selectedDate } = useCalendarStore();

  const targetPosts = posts.filter((post) =>
    dayjs(post.publishedAt).isSame(selectedDate, "day"),
  );

  if (targetPosts.length === 0) return null;

  return (
    <article className="mx-auto my-8 flex max-w-7xl flex-col gap-6">
      <PostSection
        title={`${dayjs(selectedDate).format("YYYY-MM-DD")} 포스팅`}
        posts={targetPosts}
        fixedLayout="list"
      />
    </article>
  );
};

export default SelectedPostSection;
