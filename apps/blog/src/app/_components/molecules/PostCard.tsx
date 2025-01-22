import {
  Bars3BottomLeftIcon,
  CalendarDaysIcon,
  ClockIcon,
} from "@heroicons/react/24/outline";
import Image from "next/image";
import Link from "next/link";

import type { IPostWithETC } from "#/types";

import Tag from "#/app/_components/atoms/Tag";

interface Props {
  post: IPostWithETC;
}

const PostCard: React.FC<Props> = ({ post }) => {
  return (
    <li key={post.path} className="flex flex-col">
      <Link href={post.path}>
        <figure className="relative aspect-video overflow-hidden rounded-xl">
          <Image
            src={post.thumbnail}
            alt={post.title + " 썸네일"}
            fill
            className="transition-all hover:scale-x-110 hover:scale-y-105"
          />
        </figure>
      </Link>
      <div className="flex flex-col gap-2 px-1 py-2">
        <div className="flex gap-4 text-xs *:flex *:items-center *:gap-1">
          <div>
            <CalendarDaysIcon className="h-5 w-5" />
            <time>{post.publishedAt}</time>
          </div>
          <div className="mr-auto">
            <Bars3BottomLeftIcon className="h-5 w-5" />
            <span>단어: {post.wordCount.toLocaleString()}개</span>
          </div>
          <div>
            <ClockIcon className="h-5 w-5" />
            <span>{post.readingMinutes}분</span>
          </div>
        </div>
        <Link href={post.path} className="underline-offset-2 hover:underline">
          <h2 className="text-lg font-bold">{post.title}</h2>
        </Link>
        <Link href={post.path} className="underline-offset-2 hover:underline">
          <p className="mb-2 line-clamp-3 text-sm text-gray-500">
            {post.description}
          </p>
        </Link>
        <ul className="flex flex-wrap gap-3 self-start text-sm font-semibold">
          {post.tags.map((tag) => (
            <Tag key={tag} tag={tag} />
          ))}
        </ul>
      </div>
    </li>
  );
};

export default PostCard;
