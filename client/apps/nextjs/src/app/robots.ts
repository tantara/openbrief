import type { MetadataRoute } from "next";

const baseUrl = "https://openbrief.app";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      // App, auth, and feedback surfaces are not marketing pages.
      disallow: ["/api/", "/youtube/", "/feedback"],
    },
    sitemap: `${baseUrl}/sitemap.xml`,
    host: baseUrl,
  };
}
