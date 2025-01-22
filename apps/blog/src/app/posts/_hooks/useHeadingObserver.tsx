import { useEffect, useRef, useState } from "react";

import useScrollDirection from "#/hooks/useScrollDirection";

interface Props {
  query: string;
  headings: string[];
}

export const useHeadingsObserver = ({ query, headings }: Props) => {
  const { direction } = useScrollDirection();
  const observer = useRef<IntersectionObserver | null>(null);
  const [activeId, setActiveId] = useState("");

  useEffect(() => {
    const scrollMarginOption: IntersectionObserverInit = {
      rootMargin: "-32px 0px -80px 0px",
    };

    const handleObserver: IntersectionObserverCallback = (entries) => {
      entries.forEach((entry) => {
        if (!(entry.target instanceof HTMLElement)) return;

        const targetId = `#${entry.target.id}`;
        const isObserved = entry.target.dataset.observed === "true";

        // 헤딩 태그가 처음으로 뷰포트에 들어오는 경우
        if (entry.isIntersecting && !isObserved) {
          setActiveId(targetId);
          entry.target.dataset.observed = "true";
        }
        // 헤딩 태그가 뷰포트에서 나가는 경우
        else if (!entry.isIntersecting && isObserved) {
          entry.target.dataset.observed = "false";
        }
      });
    };

    observer.current = new IntersectionObserver(
      handleObserver,
      scrollMarginOption,
    );

    // 게시글의 제목이 <h1>이라서 제외시킴
    const elements = document.querySelectorAll(query);
    [...elements].slice(1).forEach((elem) => observer.current?.observe(elem));

    return () => observer.current?.disconnect();
  }, [direction, headings, query]);

  return activeId;
};
