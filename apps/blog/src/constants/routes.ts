import { DEFAULT_SITEMAP } from "@workspace/constants";

import {
  BriefcaseIcon as OBriefcaseIcon,
  DocumentTextIcon as ODocumentTextIcon,
  LightBulbIcon as OLightBulbIcon,
  MapIcon as OMapIcon,
  NewspaperIcon as ONewspaperIcon,
  TagIcon as OTagIcon,
} from "@heroicons/react/24/outline";
import {
  BriefcaseIcon as SBriefcaseIcon,
  DocumentTextIcon as SDocumentTextIcon,
  LightBulbIcon as SLightBulbIcon,
  MapIcon as SMapIcon,
  NewspaperIcon as SNewspaperIcon,
  TagIcon as STagIcon,
} from "@heroicons/react/24/solid";

import type { IRoute } from "#/types";

/** 전체 경로 */
export const ROUTES: IRoute[] = [
  {
    path: "/resume",
    Outline: ODocumentTextIcon,
    Solid: SDocumentTextIcon,
    label: "이력서",
    isDraft: false,
  },
  {
    path: "/portfolio",
    Outline: OBriefcaseIcon,
    Solid: SBriefcaseIcon,
    label: "포트폴리오",
    isDraft: false,
  },
  {
    path: "/ai",
    Outline: OLightBulbIcon,
    Solid: SLightBulbIcon,
    label: "AI 포스팅",
    isDraft: false,
    sitemap: DEFAULT_SITEMAP,
  },
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
