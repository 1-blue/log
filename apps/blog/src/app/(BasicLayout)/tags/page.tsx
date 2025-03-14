import { redirect } from "next/navigation";
import type { Metadata, NextPage } from "next";

import { Separator } from "@workspace/ui/components/Separator";

import { getAllPosts } from "#/libs/post";
import { getSharedMetadata } from "#/libs";

import PostList from "#/app/_components/molecules/PostList";
import AllTag from "#/app/(BasicLayout)/tags/_components/AllTag";
import TagCombobox from "#/app/(BasicLayout)/tags/_components/TagCombobox";

interface Props {
  searchParams: Promise<{ tag?: string }>;
}

const allPosts = getAllPosts();
const DEFAULT_TAG = allPosts[0]?.tags[0] ?? "";

export const generateMetadata = async ({
  searchParams,
}: Props): Promise<Metadata> => {
  const { tag } = await searchParams;

  if (!tag) {
    return getSharedMetadata({
      title: "블로그 태그",
      description: "프론트엔드 개발자 박상은의 블로그 태그",
    });
  }

  const firstPostWithTag = allPosts.find((metadata) =>
    metadata.tags.includes(tag),
  );

  if (!firstPostWithTag) {
    return getSharedMetadata({
      title: "블로그 태그",
      description: "프론트엔드 개발자 박상은의 블로그 태그",
    });
  }
  return {
    ...getSharedMetadata({
      title: `블로그 태그 - ${tag}`,
      description: `프론트엔드 개발자 박상은의 블로그 "${tag}"를 가진 게시글들`,
      keywords: [tag],
      images: [firstPostWithTag.thumbnail],
    }),
  };
};

const Page: NextPage<Props> = async ({ searchParams }) => {
  const { tag } = await searchParams;

  const duplicatedTags = allPosts.map((metadata) => metadata.tags).flat();
  const tags = duplicatedTags.reduce<Record<string, number>>((prev, acc) => {
    if (acc in prev) prev[acc] += 1;
    else prev[acc] = 1;

    return prev;
  }, {});
  const filteredPosts = tag
    ? allPosts.filter((metadata) => metadata.tags.includes(tag))
    : [];

  if (!tag) return redirect(`/tags?tag=${DEFAULT_TAG}`);

  return (
    <article>
      <section className="mx-auto mb-4 flex max-w-7xl justify-end">
        <TagCombobox tags={Object.keys(tags)} targetTag={tag} />
      </section>

      <section className="mx-auto my-8 flex max-w-7xl flex-col-reverse justify-between gap-6 sm:flex-row">
        <AllTag tags={tags} targetTag={tag} />
      </section>

      <Separator className="mx-auto my-4 max-w-7xl" />

      {/* 검색된 게시글들 */}
      <section className="mx-auto my-8 max-w-7xl">
        <ul className="flex flex-col gap-4">
          {filteredPosts.map((metadata) => (
            <PostList key={metadata.path} post={metadata} />
          ))}
        </ul>
      </section>
    </article>
  );
};

export default Page;
