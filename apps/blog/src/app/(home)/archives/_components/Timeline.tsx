import Link from "next/link";
import { CheckCircleIcon } from "@heroicons/react/24/solid";

import { cn } from "@repo/ui/utils";
import type { IPost } from "#/types";

interface Props {
  latestSortedPosts: Pick<
    IPost,
    "title" | "description" | "publishedAt" | "path"
  >[];
}

const Timeline: React.FC<Props> = ({ latestSortedPosts }) => {
  return (
    <ul className="timeline timeline-vertical timeline-snap-icon max-md:timeline-compact">
      {latestSortedPosts.map(
        ({ publishedAt, title, description, path }, index) => (
          <li key={title} className="max-w-4xl md:mx-auto">
            <hr />
            <div className="timeline-middle">
              <CheckCircleIcon className="h-6 w-6" />
            </div>
            <div
              className={cn(
                "!mb-6 flex flex-col text-start md:mb-10",
                index % 2 === 0
                  ? "timeline-start md:text-end"
                  : "timeline-end md:text-start",
              )}
            >
              <time className="inline-block text-xs font-semibold">
                {publishedAt}
              </time>
              <Link
                href={path}
                className="inline-block text-lg font-black underline-offset-4 transition-colors hover:text-main-500 hover:underline dark:hover:text-main-600"
              >
                {title}
              </Link>
              <div className="text-sm">{description}</div>
            </div>
            <hr />
          </li>
        ),
      )}
    </ul>
  );
};

export default Timeline;
