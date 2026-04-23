import { cache } from "react";
import type { Metadata, NextPage } from "next";
import dynamic from "next/dynamic";
import { notFound } from "next/navigation";

import { Separator } from "@workspace/ui/components/Separator";

import ButtomSection from "#/app/(PostLayout)/posts/_components/BottomSection/BottomSection";
import SuggestSection from "#/app/(PostLayout)/posts/_components/SuggestSection/SuggestSection";
import Thumbnail from "#/app/(PostLayout)/posts/_components/Thumbnail";
import TOC from "#/app/(PostLayout)/posts/_components/TOC";
import TopSection from "#/app/(PostLayout)/posts/_components/TopSection/TopSection";
import { getSharedMetadata } from "#/libs";
import { getAllPosts, getPostTOC } from "#/libs/post";

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
  const Post = dynamic(() => import(`../../../../_posts/${postURL}.mdx`));

  const toc = getPostTOC(postURL);

  return (
    <div className="relative">
      {toc && <TOC toc={toc} />}

      <TopSection {...targetPost} />

      <Separator className="my-6" />

      <Thumbnail thumbnail={targetPost.thumbnail} />

      <Separator className="my-6" />

      <Post />

      <Separator className="my-6" />

      <ButtomSection {...targetPost} />

      <Separator className="my-6" />

      <SuggestSection postURL={postURL} />
    </div>
  );
};

export default Page;
