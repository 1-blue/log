import fs from "fs";
import { sync } from "glob";
import matter from "gray-matter";
import yaml from "js-yaml";
import path from "path";
import { cache } from "react";
import readingTime from "reading-time";

import { makeThumbnailPath, toKoreaDate } from "#/libs";
import type { IPost, IPostWithETC } from "#/types";

/** YAML 날짜 자동 파싱 비활성화 - 입력값을 항상 한국 시간 문자열로 유지 */
const matterOptions = {
  engines: {
    yaml: {
      parse: (str: string) =>
        yaml.load(str, { schema: yaml.JSON_SCHEMA }) as Record<string, unknown>,
    },
  },
};

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

    // 게시글 메타데이터 얻기 (날짜는 문자열로 유지 → 한국 시간 기준 파싱)
    const { data, content } = matter(postFileData, matterOptions);
    const metadata = data as IPost;

    /** 게시글 상대 경로 ( `/state-management/redux` ) */
    const relativePostPath = postPath
      .slice(postFolderPath.length)
      .replace(".mdx", "");

    const createdAtFormatted = toKoreaDate(String(metadata.createdAt ?? ""));
    const publishedAtFormatted = toKoreaDate(
      String(metadata.publishedAt ?? ""),
    );

    return {
      content,
      ...metadata,
      createdAt: createdAtFormatted,
      publishedAt: publishedAtFormatted,
      path: DEFAULT_PATH + relativePostPath,
      thumbnail:
        metadata.thumbnail ||
        makeThumbnailPath({
          title: metadata.title,
          description: metadata.description,
          createdAt: metadata.createdAt as string,
        }),
      breadcrumbs: relativePostPath.split("/").filter((v) => v !== ""),
      readingMinutes: Math.ceil(readingTime(content).minutes),
      wordCount: content.split(/\s+/g).length,
    };
  });

  if (publishedOnly) return allPosts.filter(({ draft }) => !draft);
  return allPosts;
});

export const getPostTOC = cache((postURL: string) => {
  const post = getAllPosts().find(({ path }) => path.includes(postURL));
  if (!post) return null;

  // 정규식을 사용하여 ##, ###, #### 헤딩 추출
  const headings = post.content.match(/^(#{2,4})\s+(.+)$/gm) || [];

  // 헤딩 정보 구조화
  return headings.map((heading) => {
    // depth ( ##(2), ###(3), ####(4) )
    const depth = heading.match(/^(#{2,4})/)?.[0]?.length || 0;
    // title
    const title = heading.replace(/^#{2,4}\s+/, "");
    // tag id
    const id = title.toLowerCase().replace(/\s+/g, "-");

    return {
      depth,
      title,
      id,
    };
  });
});
