import { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: ["/"],
      },
    ],
    sitemap: "https://blog.story-dict.com/sitemap.xml",
    host: "https://blog.story-dict.com",
  };
}
