import type { ISitemap } from "@repo/constants";

/** 게시글 메타 데이터 */
export interface IPost {
  /** 게시글 제목 */
  title: string;
  /** 게시글 내용 */
  description: string;
  /** 게시글 태그들 */
  tags: string[];
  /** 게시글 아이콘 */
  icon: string;
  /** 게시글 썸네일 */
  thumbnail: string;
  /** 게시글 생성일 */
  createdAt: string;
  /** 게시글 배포일 */
  publishedAt: string;
  /** 사이트맵 */
  sitemap: ISitemap;
  /** 게시글 게시 여부 */
  draft: boolean;
  /** 게시글 경로 */
  path: string;
  /** 게시글 경로 (`/`단위 배열) */
  breadcrumbs: string[];
}

/** 필요한 데이터를 추가한 게시글 메타 데이터 */
export interface IPostWithETC extends IPost {
  /** 파싱된 게시글 내용 */
  content: string;
  /** 분량 ( 평균 읽기 시간 ) */
  readingMinutes: number;
  /** 단어 개수 */
  wordCount: number;
}
