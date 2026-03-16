import { nowKorea } from "#/libs/dayjs";
import { makeQueries } from "#/libs/makeQueries";

interface IMakeThumbnailArgs {
  title: string;
  description?: string;
  /** 한국 시간 기준 (YYYY-MM-DD HH:mm:ss) */
  createdAt?: string;
  author?: string;
}

export const makeThumbnailPath = ({
  title,
  description = "",
  createdAt = nowKorea().format("YYYY-MM-DD HH:mm:ss"),
  author = "1-blue",
}: IMakeThumbnailArgs) => {
  return makeQueries("/api/thumbnail", {
    title,
    description,
    createdAt,
    author,
  });
};
