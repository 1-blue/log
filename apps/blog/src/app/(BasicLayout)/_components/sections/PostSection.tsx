"use client";

import { useEffect, useState } from "react";

import GridView from "#/app/_components/organisms/GridView";
import ListView from "#/app/_components/organisms/ListView";
import type { IPostWithETC } from "#/types";

type PostSectionLayout = "grid" | "list";

type ExcludeTagToggle = {
  tag: string;
  label: string;
  defaultChecked?: boolean;
  caseInsensitive?: boolean;
};

interface Props {
  title: string;
  posts: IPostWithETC[];
  fixedLayout?: PostSectionLayout;
  excludeTagToggle?: ExcludeTagToggle;
}

const PostSection: React.FC<Props> = ({
  title,
  posts,
  fixedLayout,
  excludeTagToggle,
}) => {
  const [layout, setLayout] = useState<PostSectionLayout>(
    fixedLayout || "grid",
  );
  const [isExcludeTagEnabled, setIsExcludeTagEnabled] = useState<boolean>(
    excludeTagToggle?.defaultChecked ?? false,
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

  const postsToRender = (() => {
    if (!excludeTagToggle || !isExcludeTagEnabled) return posts;

    const target = excludeTagToggle.caseInsensitive
      ? excludeTagToggle.tag.toLowerCase()
      : excludeTagToggle.tag;

    return posts.filter((post) => {
      return !post.tags.some((t) => {
        const v = excludeTagToggle.caseInsensitive ? t.toLowerCase() : t;
        return v === target;
      });
    });
  })();

  return (
    <>
      <div className="flex items-center justify-between gap-3">
        <h6 className="text-lg font-bold">{title}</h6>

        {excludeTagToggle && (
          <label className="flex items-center gap-2 text-sm">
            <span className="whitespace-nowrap text-gray-600">
              {excludeTagToggle.label}
            </span>
            <input
              type="checkbox"
              className="h-4 w-4"
              checked={isExcludeTagEnabled}
              onChange={(e) => setIsExcludeTagEnabled(e.target.checked)}
              aria-label={excludeTagToggle.label}
            />
          </label>
        )}
      </div>

      {layout === "grid" ? (
        <GridView posts={postsToRender} />
      ) : (
        <ListView posts={postsToRender} />
      )}
    </>
  );
};

export default PostSection;
