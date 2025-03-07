import { cache } from "react";
import { notFound } from "next/navigation";
import type { Metadata, NextPage } from "next";
import dynamic from "next/dynamic";

import { getAllPosts, getPostTOC } from "#/libs/post";
import { getSharedMetadata } from "#/libs";

import Thumbnail from "#/app/posts/_components/Thumbnail";
import TopSection from "#/app/posts/_components/TopSection/TopSection";
import ButtomSection from "#/app/posts/_components/BottomSection/BottomSection";
import SuggestSection from "#/app/posts/_components/SuggestSection/SuggestSection";
import TOC from "#/app/posts/_components/TOC";

interface Props {
  params: Promise<{ slugs: string[] }>;
}

const allPosts = getAllPosts();
const getTargetPost = cache((postURL: string) =>
  allPosts.find(({ path }) => path.includes(postURL)),
);

export const generateStaticParams = () => {
  return allPosts.map(({ path }) => ({
    slugs: path.split("/").filter((v) => !["", "posts"].includes(v)),
  }));
};

export const generateMetadata = async ({
  params,
}: Props): Promise<Metadata> => {
  const { slugs } = await params;
  const postURL = decodeURIComponent(slugs.join("/"));
  const targetPost = getTargetPost(postURL);
  if (!targetPost) return notFound();

  const { title, description, thumbnail, tags } = targetPost;

  return getSharedMetadata({
    title,
    description,
    keywords: tags,
    images: [thumbnail],
  });
};

const Page: NextPage<Props> = async ({ params }) => {
  const { slugs } = await params;
  const postURL = decodeURIComponent(slugs.join("/"));
  const targetPost = getTargetPost(postURL);
  if (!targetPost) return notFound();

  // Vercel 빌드 시 에러 발생으로 인해 상대경로 사용
  const Post = dynamic(() => import(`../../../_posts/${postURL}.mdx`));

  const toc = getPostTOC(postURL);

  return (
    <div className="relative">
      {toc && <TOC toc={toc} />}

      <TopSection {...targetPost} />

      <div className="divider mb-6 mt-0" />

      <Thumbnail thumbnail={targetPost.thumbnail} />

      <div className="divider my-6" />

      <Post />

      <div className="divider my-6" />

      <ButtomSection {...targetPost} />

      <div className="divider my-6" />

      <SuggestSection postURL={postURL} />
    </div>
  );
};

export default Page;
