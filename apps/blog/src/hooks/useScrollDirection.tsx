import { useCallback, useEffect, useState } from "react";

const throttleHelper = (callback: () => void, waitTime: number) => {
  let timerId: ReturnType<typeof setTimeout> | null = null;

  return () => {
    if (timerId) return;

    timerId = setTimeout(() => {
      callback();
      timerId = null;
    }, waitTime);
  };
};

/**
 * 마지막 스크롤링의 방향을 알아내는 훅
 * @returns [스크롤 방향, 스크롤 최하단 여부, 현재 스크롤 위치] 순서로 반환 ( boolean, boolean, number )
 */
const useScrollDirection = () => {
  // 마지막 스크롤 방향
  const [direction, setDirection] = useState<"up" | "down">("up");
  // 현재 스크롤 위치값 저장할 변수
  const [pageY, setPageY] = useState(0);
  // 현재 스크롤이 최하단에 있는지 판단할 변수
  const [isBottom, setIsBottom] = useState(false);

  // 현재 스크롤 방향을 확인할 스크롤 이벤트 함수
  const handleScroll = useCallback(() => {
    /**
     * scrollHeight: 총 컨텐츠 높이
     * clientHeight: 현재 보이는 높이 ( 현재 화면(컨텐츠)의 높이 )
     * scrollY: 현재 스크롤 높이
     *
     * 따라서 "총 컨텐츠 높이 === 현재 보이는 높이 + 현재 스크롤 높이" 라면 최하단까지 스크롤을 내린 것
     */
    const {
      scrollY,
      document: {
        documentElement: { scrollHeight, clientHeight },
      },
    } = window;

    const deltaY = scrollY - pageY;
    const direction = scrollY !== 0 && deltaY >= 0 ? "down" : "up";
    const isBottom = scrollHeight - scrollY - clientHeight === 0;

    setDirection(direction);
    setPageY(scrollY);
    setIsBottom(isBottom);
  }, [pageY, setDirection, setPageY, setIsBottom]);

  // 스크롤 이벤트에 쓰로틀링 적용
  const throttleScroll = throttleHelper(handleScroll, 50);

  // 스크롤 이벤트 등록
  useEffect(() => {
    document.addEventListener("scroll", throttleScroll);
    return () => document.removeEventListener("scroll", throttleScroll);
  }, [throttleScroll]);

  return { direction, isBottom, pageY };
};

export default useScrollDirection;
