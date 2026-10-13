/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Camera access requires HTTPS in production (or localhost in dev).
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [{ key: "Permissions-Policy", value: "camera=(self)" }],
      },
      {
        // The service worker must always be revalidated so updates roll out
        source: "/sw.js",
        headers: [
          { key: "Cache-Control", value: "no-cache, no-store, must-revalidate" },
          { key: "Service-Worker-Allowed", value: "/" },
        ],
      },
    ];
  },
};
export default nextConfig;
