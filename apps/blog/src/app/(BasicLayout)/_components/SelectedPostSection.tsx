"use client";

import PostSection from "#/app/(BasicLayout)/_components/sections/PostSection";
import { toKoreaDate } from "#/libs/dayjs";
import { useCalendarStore } from "#/stores";
import type { IPostWithETC } from "#/types";

interface Props {
  posts: IPostWithETC[];
}

const SelectedPostSection: React.FC<Props> = ({ posts }) => {
  const { selectedDate } = useCalendarStore();

  const selectedDateStr = selectedDate ? toKoreaDate(selectedDate) : "";
  const targetPosts = posts.filter(
    (post) => post.createdAt === selectedDateStr,
  );

  if (targetPosts.length === 0) return null;

  return (
    <article className="mx-auto my-8 flex max-w-7xl flex-col gap-6">
      <PostSection
        title={`${selectedDateStr} 포스팅`}
        posts={targetPosts}
        fixedLayout="list"
      />
    </article>
  );
};

export default SelectedPostSection;
