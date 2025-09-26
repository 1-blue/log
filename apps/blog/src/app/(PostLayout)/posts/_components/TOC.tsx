"use client";

import { useEffect, useState, useRef } from "react";
import { motion } from "motion/react";
import Link from "next/link";
import { ListBulletIcon, XMarkIcon } from "@heroicons/react/24/outline";

import { cn } from "@workspace/ui/lib/utils";
import { Button } from "@workspace/ui/components/Button";

interface IProps {
  toc: {
    depth: number;
    title: string;
    id: string;
  }[];
}

const TOC: React.FC<IProps> = ({ toc }) => {
  const [activeId, setActiveId] = useState("");
  const [isExpanded, setIsExpanded] = useState(true);
  const observerRef = useRef<IntersectionObserver | null>(null);
  const observerEntriesRef = useRef<Map<string, number>>(new Map());
  const tocListRef = useRef<HTMLUListElement>(null);

  useEffect(() => {
    const headingElements = toc
      .map(({ id }) => document.getElementById(id))
      .filter(Boolean) as HTMLElement[];

    if (observerRef.current) {
      observerRef.current.disconnect();
    }

    observerEntriesRef.current.clear();

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          observerEntriesRef.current.set(
            entry.target.id,
            entry.intersectionRatio,
          );
        });

        const activeEntry = Array.from(
          observerEntriesRef.current.entries(),
        ).reduce(
          (max, [id, ratio]) => {
            return ratio > max.ratio ? { id, ratio } : max;
          },
          { id: "", ratio: 0 },
        );

        if (activeEntry.ratio > 0) {
          setActiveId(activeEntry.id);
        } else {
          const closestHeading = headingElements.reduce(
            (closest, heading) => {
              const { top } = heading.getBoundingClientRect();
              const absDiff = Math.abs(top);
              if (closest === null || absDiff < closest.absDiff) {
                return { id: heading.id, absDiff };
              }
              return closest;
            },
            null as null | { id: string; absDiff: number },
          );

          if (closestHeading) {
            setActiveId(closestHeading.id);
          }
        }
      },
      {
        rootMargin: "-10% 0px -80% 0px",
        threshold: [0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1],
      },
    );

    observerRef.current = observer;

    headingElements.forEach((element) => {
      if (element) observer.observe(element);
    });

    return () => {
      observer.disconnect();
    };
  }, [toc]);

  useEffect(() => {
    if (activeId && tocListRef.current) {
      const activeElement = tocListRef.current.querySelector(
        `[data-id="${activeId}"]`,
      );
      if (activeElement) {
        activeElement.scrollIntoView({
          behavior: "smooth",
          block: "center",
        });
      }
    }
  }, [activeId]);

  const handleClick = (id: string) => (e: React.MouseEvent) => {
    e.preventDefault();
    const element = document.getElementById(id);
    if (element) {
      element.scrollIntoView({ behavior: "smooth" });
      setActiveId(id);
    }
  };

  if (!isExpanded) {
    return (
      <Button
        onClick={() => setIsExpanded(true)}
        variant="outline"
        size="icon"
        className="fixed top-4 right-4 z-50 cursor-pointer"
        title="목차 열기"
      >
        <ListBulletIcon />
      </Button>
    );
  }

  return (
    <nav className="bg-accent fixed top-4 right-4 z-50 w-64 rounded-lg text-xs shadow-md">
      <Button
        onClick={() => setIsExpanded(false)}
        variant="ghost"
        size="icon"
        className="absolute top-2 right-2 z-10 cursor-pointer rounded-full p-1 text-gray-500"
        title="목차 닫기"
      >
        <XMarkIcon className="h-5 w-5" />
      </Button>

      <ul
        ref={tocListRef}
        className="max-h-96 space-y-1 overflow-y-auto py-4 pr-1 pl-3 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {toc.map(({ id, depth, title }) => (
          <li
            key={id}
            className="relative leading-tight transition-colors"
            style={{ paddingLeft: `${(depth - 1) * 12}px` }}
            data-id={id}
          >
            {id === activeId && (
              <motion.div
                layoutId="toc-indicator"
                className="bg-primary absolute top-[calc(50%-4px)] -left-0.5 h-2 w-2 rounded-full"
                style={{ paddingLeft: `${(depth - 1) * 8}px` }}
              />
            )}
            <Link
              href={`#${id}`}
              onClick={handleClick(id)}
              className={cn(
                "hover:bg-base-300 hover:text-primary block truncate rounded-md py-1 text-sm text-gray-600 transition-colors",
                activeId === id && "text-primary font-medium",
              )}
            >
              {title}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
};

export default TOC;
