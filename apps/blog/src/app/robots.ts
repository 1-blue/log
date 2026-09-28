import { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  const origin = new URL(process.env.NEXT_PUBLIC_CLIENT_URL).origin;

  return {
    rules: [
      {
        userAgent: "*",
        allow: ["/"],
        disallow: ["/admin", "/admin/"],
      },
    ],
    sitemap: `${origin}/sitemap.xml`,
    host: origin,
  };
}
