import {
  ArchiveBoxIcon as OArchiveBoxIcon,
  NewspaperIcon as ONewspaperIcon,
  TagIcon as OTagIcon,
} from "@heroicons/react/24/outline";
import {
  ArchiveBoxIcon as SArchiveBoxIcon,
  NewspaperIcon as SNewspaperIcon,
  TagIcon as STagIcon,
} from "@heroicons/react/24/solid";

import { DEFAULT_SITEMAP } from "@repo/constants";
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
    path: "/archives",
    Outline: OArchiveBoxIcon,
    Solid: SArchiveBoxIcon,
    label: "아카이브",
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
