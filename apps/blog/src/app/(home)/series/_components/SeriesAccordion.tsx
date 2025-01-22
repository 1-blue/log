"use client";

import { useCallback, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";

import type { IPost, IPostWithETC } from "#/types";
import Accordion from "#/app/(home)/series/_components/Accordion";

interface IGroupedPosts {
  [key: string]: IPost[];
}

/** 게시글 기본 경로 */
const DEFAULT_PATH = "/posts/";

interface Props {
  allPosts: IPostWithETC[];
}

const SeriesAccordion: React.FC<Props> = ({ allPosts }) => {
  /** 같은 첫번째 카테고리가 동일한 게시글들끼리 그룹화 */
  const groupedPosts = useMemo(
    () =>
      allPosts
        .map(({ content, ...restProps }) => restProps)
        .reduce<IGroupedPosts>((acc, post) => {
          const originalPath = post.path.split(DEFAULT_PATH)[1];
          const firstLetter = originalPath.split("/")[0].toLowerCase();
          !acc[firstLetter] && (acc[firstLetter] = []);
          acc[firstLetter].push(post);
          return acc;
        }, {}),
    [allPosts],
  );

  const searchParams = useSearchParams();
  const openedSeries =
    searchParams.get("series") || Object.keys(groupedPosts)[0];

  const [checkedSeries, setCheckedSeries] = useState<Record<string, boolean>>(
    Object.fromEntries(
      Object.keys(groupedPosts).map((key) => [key, openedSeries === key]),
    ),
  );
  const isAllChecked = Object.values(checkedSeries).every(Boolean);
  const handleAllChecked: React.ChangeEventHandler<HTMLInputElement> =
    useCallback((e) => {
      const { checked } = e.target;

      setCheckedSeries((prev) =>
        Object.fromEntries(Object.keys(prev).map((key) => [key, checked])),
      );
    }, []);
  const setIsOpen = useCallback(
    (key: string, isOpen: boolean) =>
      setCheckedSeries({ ...checkedSeries, [key]: isOpen }),
    [checkedSeries, setCheckedSeries],
  );

  return (
    <ul className="mx-auto my-8 flex max-w-7xl flex-col gap-4">
      <div className="form-control">
        <label className="label ml-auto flex cursor-pointer items-center gap-3">
          <span className="label-text">
            전체 {isAllChecked ? "닫기" : "열기"}
          </span>
          <input
            type="checkbox"
            className="toggle"
            checked={isAllChecked}
            onChange={handleAllChecked}
          />
        </label>
      </div>

      {Object.keys(groupedPosts).map((key) => (
        <Accordion
          key={key}
          title={key}
          posts={groupedPosts[key]}
          isOpen={checkedSeries[key]}
          setIsOpen={setIsOpen}
        />
      ))}
    </ul>
  );
};

export default SeriesAccordion;
