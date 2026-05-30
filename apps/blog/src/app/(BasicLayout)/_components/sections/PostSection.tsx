"use client";

import { useEffect, useState } from "react";

import GridView from "#/app/_components/organisms/GridView";
import ListView from "#/app/_components/organisms/ListView";
import type { IPostWithETC } from "#/types";

type PostSectionLayout = "grid" | "list";

interface Props {
  title: string;
  posts: IPostWithETC[];
  fixedLayout?: PostSectionLayout;
}

const PostSection: React.FC<Props> = ({ title, posts, fixedLayout }) => {
  const [layout, setLayout] = useState<PostSectionLayout>(
    fixedLayout || "grid",
  );

  useEffect(() => {
    if (fixedLayout) return;

    const handleResize = () => {
      const newLayout = window.innerWidth >= 1280 ? "grid" : "list";
      setLayout(newLayout);
    };

    // 초기 렌더링 시에도 레이아웃 설정
    handleResize();

    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, [fixedLayout]);

  return (
    <>
      <div className="flex items-center justify-between gap-3">
        <h6 className="text-lg font-bold">{title}</h6>
      </div>

      {layout === "grid" ? (
        <GridView posts={posts} />
      ) : (
        <ListView posts={posts} />
      )}
    </>
  );
};

export default PostSection;
