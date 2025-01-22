import { useMemo } from "react";

import { getAllPosts } from "#/libs/post";
import Blockquote from "#/components/mdx/Blockquote";

import ListView from "#/app/_components/organisms/ListView";

interface Props {
  baseURL: string;
}

const allPosts = getAllPosts();

/** 게시글 기본 경로 */
const DEFAULT_PATH = "/posts";

const SuggestSection: React.FC<Props> = ({ baseURL }) => {
  /** 관련 게시글 */
  const relatedPosts = useMemo(
    () =>
      allPosts.filter(({ path }) => {
        const isSamePath = path === `${DEFAULT_PATH}/${baseURL}`;
        if (isSamePath) return false;

        const firstBreadcrumb = path
          .slice(DEFAULT_PATH.length + 1)
          .split("/")[0];

        return baseURL.includes(firstBreadcrumb ?? "");
      }),
    [baseURL],
  );

  const hasRelatedPosts = relatedPosts.length > 0;

  const randomPosts = useMemo(
    () => allPosts.sort(() => Math.random() - 0.5).slice(0, 2),
    [],
  );

  return (
    <section>
      {hasRelatedPosts ? (
        <>
          <h6 className="mb-4 text-xl font-semibold">연관된 포스트</h6>
          <ListView posts={relatedPosts} />
        </>
      ) : (
        <>
          <Blockquote type="success" className="mb-6">
            연관된 포스트가 없어서 랜덤한 포스트로 대체합니다.
          </Blockquote>
          <ListView posts={randomPosts} />
        </>
      )}
    </section>
  );
};

export default SuggestSection;
