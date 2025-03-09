"use client";

import { AnchorHTMLAttributes, useEffect, useState } from "react";
import Link from "next/link";

import { cn } from "@workspace/ui/lib/utils";
import {
  HoverCard,
  HoverCardTrigger,
  HoverCardContent,
} from "@workspace/ui/components/HoverCard";
import {
  Avatar,
  AvatarImage,
  AvatarFallback,
} from "@workspace/ui/components/avatar";
import { makeQueries } from "#/libs";
interface IProps extends AnchorHTMLAttributes<HTMLAnchorElement> {
  href: string;
}

interface IURLMetadata {
  title: string;
  description: string;
  image: string;
  siteName: string;
}

const Anchor: React.FC<React.PropsWithChildren<IProps>> = ({
  children,
  className,
  href,
  ...restProps
}) => {
  const [metadata, setMetadata] = useState<IURLMetadata | null>(null);

  useEffect(() => {
    const fetchMetadata = async () => {
      try {
        const response = await fetch(
          makeQueries("/api/metadata", { url: href }),
        );
        const data = await response.json();
        setMetadata(data);
      } catch (error) {
        console.error("Failed to fetch metadata:", error);
      }
    };

    fetchMetadata();
  }, [href]);

  return (
    <HoverCard>
      <HoverCardTrigger asChild>
        <Link
          href={href}
          target="_blank"
          rel="noreferrer noopener"
          className={cn(
            "text-primary font-semibold underline underline-offset-2 transition-colors",
            className,
          )}
          {...restProps}
        >
          {children}
        </Link>
      </HoverCardTrigger>
      <HoverCardContent className="w-xs">
        <div className="flex items-center justify-center space-x-4">
          <Avatar className="flex size-16 items-center justify-center">
            <AvatarImage
              src={metadata?.image}
              className="size-16 rounded-full"
            />
            <AvatarFallback className="bg-accent size-16 rounded-full">
              {metadata?.siteName ?? "익명"}
            </AvatarFallback>
          </Avatar>
          <div className="flex-1 space-y-1">
            <span className="text-muted-foreground text-xs">
              - {metadata?.siteName ?? "익명"} -
            </span>
            <h6 className="line-clamp-1 text-sm font-semibold">
              {metadata?.title ?? "익명의 사이트"}
            </h6>
            <p className="line-clamp-2 text-xs">
              {metadata?.description ?? "페이지 정보를 불러오는중입니다 ..."}
            </p>
          </div>
        </div>
      </HoverCardContent>
    </HoverCard>
  );
};

export default Anchor;
