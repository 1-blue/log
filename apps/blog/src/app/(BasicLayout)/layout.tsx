import Navigation from "#/app/(BasicLayout)/_components/Navigation";
import InfoSection from "#/app/(BasicLayout)/_components/sections/InfoSection";
import SelectedPostSection from "#/app/(BasicLayout)/_components/SelectedPostSection";
import { getAllPosts } from "#/libs/post";

const allPosts = getAllPosts();
const publishedDates = allPosts.reduce<Record<string, number>>((prev, curr) => {
  const publishedDate = curr.createdAt;
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
