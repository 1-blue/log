import { PlayIcon as OPlayIcon } from "@heroicons/react/24/outline";
import { PlayIcon as SPlayIcon } from "@heroicons/react/24/solid";

import type { ISitemap } from "@workspace/constants";

/** 경로에 대한 타입 */
export interface IRoute {
  /** 실제 경로 */
  path: `/${string}`;
  /** 경로를 표현할 텍스트 */
  label: string;
  /** 경로 아이콘 ( 선 ) */
  Solid: typeof SPlayIcon;
  /** 경로 아이콘 ( 채워짐 ) */
  Outline: typeof OPlayIcon;
  /** 숨길지 여부 */
  isDraft: boolean;
  /** 사이트맵 설정 */
  sitemap?: ISitemap;
}
