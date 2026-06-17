import { MetadataRoute } from "next";

const BASE = process.env.NEXT_PUBLIC_APP_URL ?? "https://clawwarden.space";

export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date().toISOString();
  return [
    { url: BASE,                   lastModified: now, changeFrequency: "weekly",  priority: 1.0 },
    { url: BASE + "/tokenize",    lastModified: now, changeFrequency: "monthly", priority: 0.8 },
    { url: BASE + "/pricing",      lastModified: now, changeFrequency: "monthly", priority: 0.9 },
    { url: BASE + "/security",     lastModified: now, changeFrequency: "monthly", priority: 0.8 },
    { url: BASE + "/compliance",   lastModified: now, changeFrequency: "monthly", priority: 0.8 },
    { url: BASE + "/about",        lastModified: now, changeFrequency: "monthly", priority: 0.7 },
    { url: BASE + "/terms",        lastModified: now, changeFrequency: "yearly",  priority: 0.5 },
    { url: BASE + "/privacy",      lastModified: now, changeFrequency: "yearly",  priority: 0.5 },
  ];
}
