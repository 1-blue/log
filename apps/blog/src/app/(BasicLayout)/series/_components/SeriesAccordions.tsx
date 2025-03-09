"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { FileCodeIcon, FolderClosedIcon, FolderOpenIcon } from "lucide-react";

import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@workspace/ui/components/Accordion";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbList,
  BreadcrumbSeparator,
} from "@workspace/ui/components/Breadcrumb";

import { IPost } from "#/types";

interface IGroupedPosts {
  [key: string]: IPost[];
}

interface IProps {
  allPosts: IPost[];
}

const SeriesAccordions: React.FC<IProps> = ({ allPosts }) => {
  /** 같은 첫번째 카테고리가 동일한 게시글들끼리 그룹화 */
  const groupedPosts = useMemo(
    () =>
      allPosts.reduce<IGroupedPosts>((acc, post) => {
        const originalPath = post.path.split("/posts/")[1];
        const firstLetter = originalPath?.split("/")[0]?.toLowerCase();
        if (!acc[firstLetter]) acc[firstLetter] = [];
        acc[firstLetter].push(post);
        return acc;
      }, {}),
    [allPosts],
  );

  const [openItems, setOpenItems] = useState<Record<string, boolean>>({});

  const searchParams = useSearchParams();
  const series = searchParams.get("series");

  return (
    <Accordion
      type="single"
      collapsible
      {...(series && { defaultValue: series })}
      className="mx-auto my-8 flex max-w-7xl flex-col gap-4"
      onValueChange={(value) => {
        const newOpenItems: Record<string, boolean> = {};
        Object.keys(groupedPosts).forEach((k) => {
          newOpenItems[k] = k === value;
        });
        setOpenItems(newOpenItems);
      }}
    >
      {Object.entries(groupedPosts).map(([key, posts]) => (
        <AccordionItem key={key} value={key} className="rounded-md border">
          <AccordionTrigger className="cursor-pointer rounded-none p-4 text-xl font-semibold hover:no-underline data-[state=open]:border-b">
            <div className="flex items-center gap-2">
              {openItems[key] ? <FolderOpenIcon /> : <FolderClosedIcon />}
              <span>{key}</span>
            </div>
          </AccordionTrigger>
          <AccordionContent className="flex flex-col p-0">
            {posts.map((post) => (
              <Link
                key={post.path}
                href={post.path}
                className="hover:bg-accent flex items-center gap-1.5 border-b border-dashed px-4 py-3 transition-colors last:border-b-0"
              >
                <Breadcrumb>
                  <BreadcrumbList className="gap-0.5 sm:gap-0.5">
                    {post.path
                      .split(`/posts/${key}/`)[1]
                      .split("/")
                      .map((v) => (
                        <>
                          <BreadcrumbItem key={v}>{v}</BreadcrumbItem>
                          <BreadcrumbSeparator />
                        </>
                      ))}
                  </BreadcrumbList>
                </Breadcrumb>
                <FileCodeIcon className="size-5" />
                <span className="text-base">{post.title}</span>
              </Link>
            ))}
          </AccordionContent>
        </AccordionItem>
      ))}
    </Accordion>
  );
};

export default SeriesAccordions;
