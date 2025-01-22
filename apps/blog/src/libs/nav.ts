/** 현재 `path`와 주어진 `path`가 일치하는지 확인하는 함수 */
export const isPathMatching = (currentPath: string, targetPath: string) => {
  // 루트 경로 처리
  if (targetPath === "/") return currentPath === "/";

  // 첫 번째 세그먼트 비교
  const currentSegment = currentPath.split("/")[1];
  const targetSegment = targetPath.split("/")[1];

  return currentSegment === targetSegment;
};
