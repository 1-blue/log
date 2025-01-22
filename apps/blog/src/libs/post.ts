import { cache } from "react";
import path from "path";
import dayjs from "dayjs";
import fs from "fs";
import matter from "gray-matter";
import readingTime from "reading-time";
import { sync } from "glob";

import type { IPost, IPostWithETC } from "#/types";
import { makeThumbnailPath } from "#/libs";

/** 게시글 기본 경로 */
const DEFAULT_PATH = "/posts";

/** 모든 게시글의 메타데이터 및 내용 얻는 함수 */
export const getAllPosts = cache((publishedOnly = true): IPostWithETC[] => {
  /** 모든 게시글들이 저장되어있는 폴더 경로 ( `src/_posts` ) */
  const postFolderPath = path.join(process.cwd(), "src", "_posts");
  /** 모든 게시글들의 경로들 ( `/Users/openknowl/MyWorkspace/trivia-log/src/_posts/state-management/redux.mdx` ) */
  const allPostPaths = sync(`${postFolderPath}/**/*.mdx`);

  const allPosts = allPostPaths.map((postPath) => {
    /** 특정 게시글 파일 데이터 */
    const postFileData = fs.readFileSync(postPath, { encoding: "utf8" });

    // 게시글 메타데이터 얻기
    const { data, content } = matter(postFileData);
    const metadata = data as IPost;

    /** 게시글 상대 경로 ( `/state-management/redux` ) */
    const relativePostPath = postPath
      .slice(postFolderPath.length)
      .replace(".mdx", "");

    return {
      content,
      ...metadata,
      createdAt: dayjs(metadata.createdAt).format("YYYY-MM-DD"),
      publishedAt: dayjs(metadata.publishedAt).format("YYYY-MM-DD"),
      path: DEFAULT_PATH + relativePostPath,
      thumbnail:
        metadata.thumbnail ||
        makeThumbnailPath({
          title: metadata.title,
          description: metadata.description,
          publishedAt: metadata.publishedAt,
        }),
      breadcrumbs: relativePostPath.split("/").filter((v) => v !== ""),
      readingMinutes: Math.ceil(readingTime(content).minutes),
      wordCount: content.split(/\s+/g).length,
    };
  });

  if (publishedOnly) return allPosts.filter(({ draft }) => !draft);
  return allPosts;
});
