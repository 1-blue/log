import React from "react";
import Link from "next/link";
import {
  FolderIcon,
  DocumentIcon,
  FolderOpenIcon,
} from "@heroicons/react/24/outline";
import { ChevronRightIcon } from "@heroicons/react/24/outline";

import { cn } from "@repo/ui/utils";
import type { IPost } from "#/types";

interface Props {
  title: string;
  posts: IPost[];
  isOpen: boolean;
  setIsOpen: (key: string, isOpen: boolean) => void;
}

const Accordion: React.FC<Props> = ({ title, posts, isOpen, setIsOpen }) => {
  return (
    <li className="collapse rounded-md">
      <input
        type="checkbox"
        className="peer"
        checked={isOpen}
        onChange={() => setIsOpen(title, !isOpen)}
        data-title={title}
      />
      <div
        className={cn(
          "collapse-title flex items-center gap-2 pl-4 pr-6 font-bold",
          "bg-gray-400 text-gray-800",
          "dark:bg-gray-700 dark:text-gray-400",
        )}
      >
        {isOpen ? (
          <FolderOpenIcon className="h-5 w-5" />
        ) : (
          <FolderIcon className="h-5 w-5" />
        )}
        <span>{title}</span>

        <ChevronRightIcon
          className={cn("ml-auto h-5 w-5 duration-500", isOpen && "rotate-90")}
        />
      </div>
      <ul
        className={cn(
          "collapse-content divide-y divide-dashed divide-gray-500 !p-0",
          "peer-checked:bg-gray-300",
          "dark:divide-gray-400 dark:peer-checked:bg-gray-600",
        )}
      >
        {posts.map((post) => (
          <li key={post.path}>
            <Link
              href={post.path}
              className={cn(
                "flex items-center gap-1 p-4 underline-offset-4 transition-colors hover:underline",
                "hover:bg-gray-200",
                "dark:hover:bg-gray-500",
              )}
              target="_blank"
              rel="noopener noreferrer"
            >
              <DocumentIcon className="h-5 w-5" />
              <span>{post.title}</span>
            </Link>
          </li>
        ))}
      </ul>
    </li>
  );
};

export default React.memo(Accordion);
