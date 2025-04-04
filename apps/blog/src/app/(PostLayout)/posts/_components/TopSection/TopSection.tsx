import {
  Bars3BottomLeftIcon,
  CalendarDaysIcon,
  ClockIcon,
  CalendarIcon,
  DocumentIcon,
  FolderIcon as OFolderIcon,
} from "@heroicons/react/24/outline";
import { FolderIcon as SFolderIcon } from "@heroicons/react/24/solid";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbSeparator,
} from "@workspace/ui/components/Breadcrumb";

import type { IPostWithETC } from "#/types";

import CopyLinkButton from "#/app/(PostLayout)/posts/_components/CopyLinkButton";
import ScrollBottomButton from "#/app/(PostLayout)/posts/_components/ScrollBottomButton";
import HomeLinkButton from "#/app/(PostLayout)/posts/_components/HomeLinkButton";

interface Props extends IPostWithETC {}

const TopSection: React.FC<Props> = ({
  title,
  description,
  createdAt,
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
      return <SFolderIcon className="text-primary h-4 w-4" />;
    }
    // 중간 폴더인 경우
    return <OFolderIcon className="h-4 w-4" />;
  };

  return (
    <section className="mt-6 flex flex-col items-center gap-4">
      <h1 className="text-center text-5xl leading-tight font-bold break-words break-keep whitespace-pre-wrap">
        {title}
      </h1>
      <p className="text-xl font-semibold">{description}</p>
      <div className="flex gap-4 text-xs *:flex *:items-center *:gap-1">
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-1">
            <CalendarDaysIcon className="h-5 w-5" />
            <time>게시일: {createdAt}</time>
          </div>
          <div className="flex items-center gap-1">
            <CalendarIcon className="h-5 w-5" />
            <time>수정일: {publishedAt}</time>
          </div>
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
      <div className="mt-8 flex w-full items-center justify-between">
        <Breadcrumb>
          <BreadcrumbList>
            {breadcrumbs.map((breadcrumb, index) => (
              <BreadcrumbItem key={breadcrumb}>
                {getFileOrFolderIcon(index)}
                {index === 0 ? (
                  <BreadcrumbLink
                    href={`/series?series=${breadcrumb}`}
                    className="text-primary font-semibold underline-offset-4"
                  >
                    {breadcrumb}
                  </BreadcrumbLink>
                ) : (
                  <span>{breadcrumb}</span>
                )}
                {breadcrumbs.at(-1) !== breadcrumb && <BreadcrumbSeparator />}
              </BreadcrumbItem>
            ))}
          </BreadcrumbList>
        </Breadcrumb>
        <div className="flex gap-1.5 self-start">
          <HomeLinkButton />
          <CopyLinkButton />
          <ScrollBottomButton />
        </div>
      </div>
    </section>
  );
};

export default TopSection;
