import { makeQueries } from "#/libs/makeQueries";

interface IMakeThumbnailArgs {
  title: string;
  description?: string;
  publishedAt?: string;
  author?: string;
}

export const makeThumbnailPath = ({
  title,
  description = "",
  publishedAt = new Date().toISOString(),
  author = "1-blue",
}: IMakeThumbnailArgs) => {
  return makeQueries("/api/thumbnail", {
    title,
    description,
    publishedAt,
    author,
  });
};
