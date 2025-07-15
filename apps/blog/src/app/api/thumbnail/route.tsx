import { ImageResponse } from "next/og";
import { NextRequest } from "next/server";

export const runtime = "edge";

const DEFAULT_TITLE = "내가 만든 게시글 썸네일";
const DEFAULT_DESCRIPTION = `내가 만든 게시글과 썸네일\n그리고 아무말이나 작성하는중 쉽지않네요`;
const DEFAULT_PUBLISHED_AT = new Date();
const DEFAULT_AUTHOR = "박상은 ( 1-blue )";

// 글자수 셀 때만 \n 제외하고, 원본 줄바꿈은 유지
const truncateText = (text: string, maxLength: number = 65): string => {
  const textWithoutNewlines = text.replace(/\n/g, "");
  if (textWithoutNewlines.length <= maxLength) {
    return text; // 원본 텍스트 반환 (줄바꿈 유지)
  }

  // maxLength자까지만 자르되, 원본에서 줄바꿈 위치 고려해서 자르기
  let charCount = 0;
  let cutIndex = 0;

  for (let i = 0; i < text.length; i++) {
    if (text[i] !== "\n") {
      charCount++;
    }
    if (charCount >= maxLength) {
      cutIndex = i + 1;
      break;
    }
  }

  return text.substring(0, cutIndex) + "...";
};

export const GET = async (req: NextRequest) => {
  const font = await fetch(
    new URL("../../../../public/fonts/Moneygraphy-Pixel.woff", import.meta.url),
  ).then((res) => res.arrayBuffer());

  const { searchParams } = req.nextUrl;
  const title = truncateText(searchParams.get("title") ?? DEFAULT_TITLE, 40);
  const description = truncateText(
    searchParams.get("description") ?? DEFAULT_DESCRIPTION,
  );
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
          paddingTop: 160,
          gap: 60,
          backgroundColor: "#1d4ed8",
        }}
      >
        <ul
          style={{
            ...commonTextStyle,
            display: "flex",
            flexDirection: "column",
            justifyContent: "center",
            alignItems: "center",
            fontSize: 130,
            paddingLeft: 120,
            paddingRight: 120,
            wordBreak: "keep-all",
            lineHeight: 1.25,
            textAlign: "center",
            gap: "12px",
          }}
        >
          {title.split("\n").map((line, index) => (
            <li key={index}>{line}</li>
          ))}
        </ul>
        <ul
          style={{
            ...commonTextStyle,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 80,
            textAlign: "center",
            wordBreak: "keep-all",
            paddingLeft: 120,
            paddingRight: 120,
          }}
        >
          {description.split("\n").map((line, index) => (
            <li key={index}>{line}</li>
          ))}
        </ul>

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
