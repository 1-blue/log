/** 쿼리스트링으로 만들어주는 유틸함수 */
export const makeQueries = (url: string, queries?: Record<string, string>) => {
  if (!queries) return url;

  const queryString = Object.entries(queries)
    .map(([key, value]) => `${key}=${value}`)
    .join("&");

  return `${url}?${queryString}`;
};
