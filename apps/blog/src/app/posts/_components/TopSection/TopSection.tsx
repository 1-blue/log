import Link from "next/link";
import {
  Bars3BottomLeftIcon,
  CalendarDaysIcon,
  ClockIcon,
  DocumentIcon,
  FolderIcon as OFolderIcon,
} from "@heroicons/react/24/outline";
import { FolderIcon as SFolderIcon } from "@heroicons/react/24/solid";

import type { IPostWithETC } from "#/types";

import CopyLinkButton from "#/app/posts/_components/CopyLinkButton";
import ScrollBottomButton from "#/app/posts/_components/ScrollBottomButton";

interface Props extends IPostWithETC {}

const TopSection: React.FC<Props> = ({
  title,
  description,
  publishedAt,
  readingMinutes,
  wordCount,
  breadcrumbs,
}) => {
  const getFileOrFolderIcon = (index: number) => {
    // 파일인 경우
    if (index === breadcrumbs.length - 1) {
      return <DocumentIcon className="h-4 w-4" />;
    }
    // 첫폴더 경우
    if (index === 0) {
      return (
        <SFolderIcon className="h-4 w-4 text-main-600 dark:text-main-500" />
      );
    }
    // 중간 폴더인 경우
    return <OFolderIcon className="h-4 w-4" />;
  };

  return (
    <section className="mt-6 flex flex-col items-center gap-4">
      <h1 className="whitespace-pre-wrap break-words break-keep text-5xl font-bold leading-tight">
        {title}
      </h1>
      <p className="text-xl font-semibold">{description}</p>
      <div className="flex gap-4 text-xs *:flex *:items-center *:gap-1">
        <div>
          <CalendarDaysIcon className="h-5 w-5" />
          <time>{publishedAt}</time>
        </div>
        <div>
          <ClockIcon className="h-5 w-5" />
          <span>{readingMinutes}분</span>
        </div>
        <div>
          <Bars3BottomLeftIcon className="h-5 w-5" />
          <span>단어: {wordCount.toLocaleString()}개</span>
        </div>
      </div>
      <div className="mt-8 flex w-full justify-between">
        <div className="breadcrumbs text-sm">
          <ul className="flex items-center">
            {breadcrumbs.map((breadcrumb, index) => (
              <li key={breadcrumb} className="space-x-1">
                {getFileOrFolderIcon(index)}
                {index === 0 ? (
                  <Link
                    href={`/series?series=${breadcrumb}`}
                    className="font-semibold text-main-600 underline-offset-4 dark:text-main-500"
                  >
                    {breadcrumb}
                  </Link>
                ) : (
                  <span>{breadcrumb}</span>
                )}
              </li>
            ))}
          </ul>
        </div>
        <div className="flex gap-1.5 self-start">
          <CopyLinkButton />
          <ScrollBottomButton />
        </div>
      </div>
    </section>
  );
};

export default TopSection;
