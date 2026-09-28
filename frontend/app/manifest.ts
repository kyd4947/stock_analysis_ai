import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Stock Analysis AI",
    short_name: "Stock AI",
    description: "거시경제 기반 AI 투자 분석",
    start_url: "/",
    display: "standalone",
    background_color: "#f6f7f9",
    theme_color: "#047857",
    icons: [
      { src: "/icon", sizes: "32x32", type: "image/png" },
      { src: "/apple-icon", sizes: "180x180", type: "image/png" },
      { src: "/icon512", sizes: "512x512", type: "image/png" },
    ],
  };
}
