import {
  MapIcon as OMapIcon,
  NewspaperIcon as ONewspaperIcon,
  TagIcon as OTagIcon,
} from "@heroicons/react/24/outline";
import {
  MapIcon as SMapIcon,
  NewspaperIcon as SNewspaperIcon,
  TagIcon as STagIcon,
} from "@heroicons/react/24/solid";

import { DEFAULT_SITEMAP } from "@workspace/constants";
import type { IRoute } from "#/types";

/** 전체 경로 */
export const ROUTES: IRoute[] = [
  {
    path: "/series",
    Outline: ONewspaperIcon,
    Solid: SNewspaperIcon,
    label: "시리즈",
    isDraft: false,
    sitemap: DEFAULT_SITEMAP,
  },
  {
    path: "/timeline",
    Outline: OMapIcon,
    Solid: SMapIcon,
    label: "타임라인",
    isDraft: false,
    sitemap: DEFAULT_SITEMAP,
  },
  {
    path: "/tags",
    Outline: OTagIcon,
    Solid: STagIcon,
    label: "태그",
    isDraft: false,
    sitemap: DEFAULT_SITEMAP,
  },
];
