import Link from "next/link";
import { CheckCircleIcon } from "@heroicons/react/24/solid";

import { cn } from "@workspace/ui/lib/utils";
import type { IPost } from "#/types";

interface Props {
  latestSortedPosts: Pick<
    IPost,
    "title" | "description" | "publishedAt" | "path"
  >[];
}

const Timeline: React.FC<Props> = ({ latestSortedPosts }) => {
  return (
    <div className="relative">
      {/* 세로 라인 - 모바일에서는 좌측, 데스크탑에서는 중앙 */}
      <div className="bg-primary absolute top-0 left-4 h-full w-0.5 md:left-1/2 md:-translate-x-1/2" />

      <ul className="relative z-10">
        {latestSortedPosts.map(
          ({ publishedAt, title, description, path }, index) => (
            <li key={title} className="relative mb-8">
              {/* 모바일 뷰 */}
              <div className="flex items-start md:hidden">
                {/* 체크 아이콘 - 모바일 */}
                <div className="bg-primary-foreground absolute left-4 z-20 flex size-6 -translate-x-1/2 transform items-center justify-center rounded-full">
                  <CheckCircleIcon className="text-primary size-6" />
                </div>

                {/* 오른쪽 컨텐츠 - 모바일 */}
                <div className="ml-8 pl-4">
                  <time className="block text-xs font-semibold">
                    {publishedAt}
                  </time>
                  <Link
                    href={path}
                    className="hover:text-primary block text-lg font-black underline-offset-4 transition-colors hover:underline"
                  >
                    {title}
                  </Link>
                  <div className="text-sm break-keep">{description}</div>
                </div>
              </div>

              {/* 데스크탑 뷰 */}
              <div className="hidden md:flex md:items-center">
                {/* 왼쪽 컨텐츠 - 데스크탑 (짝수 인덱스) */}
                <div
                  className={cn(
                    "w-1/2 pr-8 text-right",
                    index % 2 === 0 && "opacity-100",
                    index % 2 !== 0 && "opacity-0",
                  )}
                >
                  {index % 2 === 0 && (
                    <>
                      <time className="block text-xs font-semibold">
                        {publishedAt}
                      </time>
                      <Link
                        href={path}
                        className="hover:text-primary block text-lg font-black underline-offset-4 transition-colors hover:underline"
                      >
                        {title}
                      </Link>
                      <div className="text-sm">{description}</div>
                    </>
                  )}
                </div>

                {/* 체크 아이콘 - 데스크탑 */}
                <div className="bg-primary-foreground absolute left-1/2 z-20 flex size-6 -translate-x-1/2 transform items-center justify-center rounded-full">
                  <CheckCircleIcon className="text-primary size-6" />
                </div>

                {/* 오른쪽 컨텐츠 - 데스크탑 (홀수 인덱스) */}
                <div
                  className={cn(
                    "w-1/2 pl-8 text-left",
                    index % 2 !== 0 && "opacity-100",
                    index % 2 === 0 && "opacity-0",
                  )}
                >
                  {index % 2 !== 0 && (
                    <>
                      <time className="block text-xs font-semibold">
                        {publishedAt}
                      </time>
                      <Link
                        href={path}
                        className="hover:text-primary block text-lg font-black underline-offset-4 transition-colors hover:underline"
                      >
                        {title}
                      </Link>
                      <div className="text-sm">{description}</div>
                    </>
                  )}
                </div>
              </div>
            </li>
          ),
        )}
      </ul>
    </div>
  );
};

export default Timeline;
