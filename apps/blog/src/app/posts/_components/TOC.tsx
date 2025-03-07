"use client";

import { useEffect, useState, useRef } from "react";
import { motion } from "motion/react";
import Link from "next/link";
import { ListBulletIcon, XMarkIcon } from "@heroicons/react/24/outline";

import { cn } from "@repo/ui/utils";

interface IProps {
  toc: {
    depth: number;
    title: string;
    id: string;
  }[];
}

const TOC: React.FC<IProps> = ({ toc }) => {
  const [activeId, setActiveId] = useState("");
  const [isExpanded, setIsExpanded] = useState(false);
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
      <button
        onClick={() => setIsExpanded(true)}
        className="btn btn-circle fixed right-4 top-4 z-50"
        title="목차 열기"
      >
        <ListBulletIcon className="h-6 w-6" />
      </button>
    );
  }

  return (
    <nav className="fixed right-4 top-4 z-50 w-64 rounded-lg border border-base-300 bg-base-200 text-xs shadow-md">
      <div className="flex items-center justify-center border-b border-base-100 px-4 py-2">
        <span className="text-center text-base">목차</span>
        <button
          onClick={() => setIsExpanded(false)}
          className="absolute right-2 rounded-full p-1 text-gray-500"
          title="목차 닫기"
        >
          <XMarkIcon className="h-5 w-5" />
        </button>
      </div>

      <ul
        ref={tocListRef}
        className="max-h-96 space-y-1 overflow-y-auto px-3 py-4"
      >
        {toc.map(({ id, depth, title }) => (
          <li
            key={id}
            className="relative leading-tight transition-colors"
            style={{ paddingLeft: `${(depth - 1) * 8}px` }}
            data-id={id}
          >
            {id === activeId && (
              <motion.div
                layoutId="toc-indicator"
                className="absolute -left-1 top-[calc(50%-4px)] h-2 w-2 rounded-full bg-main-500"
                style={{ paddingLeft: `${(depth - 1) * 8}px` }}
              />
            )}
            <Link
              href={`#${id}`}
              onClick={handleClick(id)}
              className={cn(
                "block truncate rounded-md px-2 py-1 text-sm text-gray-600 transition-colors hover:bg-base-300 hover:text-main-600",
                activeId === id && "font-medium text-main-600",
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
