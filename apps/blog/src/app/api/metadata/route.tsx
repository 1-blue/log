import { NextRequest, NextResponse } from "next/server";
import * as cheerio from "cheerio";

export const runtime = "edge";

export const GET = async (req: NextRequest) => {
  const url = req.nextUrl.searchParams.get("url");

  if (!url) {
    return NextResponse.json(
      { error: "URL parameter is required" },
      { status: 400 },
    );
  }

  try {
    const response = await fetch(url);

    const html = await response.text();
    const $ = cheerio.load(html);

    const metadata = {
      title:
        $('meta[property="og:title"]').attr("content") || $("title").text(),
      description:
        $('meta[property="og:description"]').attr("content") ||
        $('meta[name="description"]').attr("content"),
      image: $('meta[property="og:image"]').attr("content"),
      siteName:
        $('meta[property="og:site_name"]').attr("content") ||
        new URL(url).hostname,
      url,
    };

    return NextResponse.json(metadata);
  } catch (error) {
    console.error("🚫 Error fetching metadata >> ", error);
    return NextResponse.json(
      { error: "Failed to fetch metadata" },
      { status: 500 },
    );
  }
};
