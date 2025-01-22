import { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: ["/"],
      },
    ],
    sitemap: "https://trivia-log.vercel.app/sitemap.xml",
    host: "https://trivia-log.vercel.app",
  };
}
