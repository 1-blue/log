import dayjs from "dayjs";

import { getAllPosts } from "#/libs/post";

import InfoSection from "#/app/(BasicLayout)/_components/sections/InfoSection";
import Navigation from "#/app/(BasicLayout)/_components/Navigation";
import SelectedPostSection from "#/app/(BasicLayout)/_components/SelectedPostSection";

const allPosts = getAllPosts();
const publishedDates = allPosts.reduce<Record<string, number>>((prev, curr) => {
  const publishedDate = dayjs(curr.publishedAt).format("YYYY-MM-DD");
  if (prev[publishedDate]) {
    prev[publishedDate]++;
  } else {
    prev[publishedDate] = 1;
  }
  return prev;
}, {});

const Layout: React.FC<React.PropsWithChildren> = ({ children }) => {
  return (
    <>
      <article className="mx-auto my-8 flex max-w-7xl flex-col gap-4 xl:flex-row">
        <InfoSection publishedDates={publishedDates} />
      </article>

      {/* 선택 포스팅 */}
      <SelectedPostSection posts={allPosts} />

      <Navigation />

      <article>{children}</article>
    </>
  );
};

export default Layout;
