import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "سنتر النخبة التعليمي — الحضور",
    short_name: "النخبة",
    description: "تسجيل الحضور بكروت QR والاشتراكات وإشعارات واتساب",
    lang: "ar",
    dir: "rtl",
    start_url: "/scan",
    display: "standalone",
    orientation: "portrait",
    background_color: "#F8F9FA",
    theme_color: "#E52328",
    icons: [{ src: "/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" }],
  };
}
