import { ImageResponse } from "next/og";
import { NextRequest } from "next/server";

export const runtime = "edge";

const DEFAULT_TITLE = "내가 만든 게시글 썸네일";
const DEFAULT_DESCRIPTION = `내가 만든 게시글과 썸네일\n그리고 아무말이나 작성하는중 쉽지않네요`;
const DEFAULT_PUBLISHED_AT = new Date();
const DEFAULT_AUTHOR = "박상은 ( 1-blue )";

const limitLines = (text: string, maxLines: number = 3) => {
  const lines = text.split("\n");
  if (lines.length <= maxLines) return text;
  return lines.slice(0, maxLines).join("\n") + "...";
};

export const GET = async (req: NextRequest) => {
  const font = await fetch(
    new URL("../../../../public/fonts/Moneygraphy-Pixel.woff", import.meta.url),
  ).then((res) => res.arrayBuffer());

  const { searchParams } = req.nextUrl;
  const title = searchParams.get("title") ?? DEFAULT_TITLE;
  const description = searchParams.get("description") ?? DEFAULT_DESCRIPTION;
  const publishedAt = new Date(
    searchParams.get("publishedAt") ?? DEFAULT_PUBLISHED_AT,
  )
    .toLocaleDateString("ko-KR")
    .replace(/\.$/, "");
  const author = searchParams.get("author") ?? DEFAULT_AUTHOR;

  const commonTextStyle: React.CSSProperties = {
    fontFamily: "og",
    letterSpacing: "-0.05em",
    fontStyle: "normal",
    color: "white",
    lineHeight: "120px",
    whiteSpace: "pre-wrap",
  };

  return new ImageResponse(
    (
      <div
        style={{
          position: "relative",
          height: "100%",
          width: "100%",
          display: "flex",
          flexFlow: "column nowrap",
          paddingTop: 240,
          gap: 100,
          backgroundColor: "#1d4ed8",
        }}
      >
        <div
          style={{
            ...commonTextStyle,
            display: "flex",
            justifyContent: "center",
            fontSize: 130,
            padding: "0 120px",
            wordBreak: "keep-all",
            lineHeight: 1.25,
          }}
        >
          {title}
        </div>
        <div
          style={{
            ...commonTextStyle,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 80,
            textAlign: "center",
            padding: "0 120px",
            wordBreak: "keep-all",
          }}
        >
          {limitLines(description)}
        </div>

        <div
          style={{
            ...commonTextStyle,
            fontSize: 60,
            position: "absolute",
            bottom: 60,
            left: 100,
          }}
        >
          {publishedAt}
        </div>
        <div
          style={{
            ...commonTextStyle,
            fontSize: 60,
            position: "absolute",
            bottom: 60,
            right: 100,
          }}
        >
          {author}
        </div>
      </div>
    ),
    {
      width: 1920,
      height: 1080,
      fonts: [
        {
          name: "Moneygraphy-Pixel",
          data: font,
          style: "normal",
        },
      ],
    },
  );
};
