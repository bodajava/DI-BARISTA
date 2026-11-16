import type { NextConfig } from "next";

const isProd = process.env.NODE_ENV === "production";

const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), payment=(self)",
  },
  // Blocks clickjacking and plugin content without breaking inline styles/scripts used by the app
  {
    key: "Content-Security-Policy",
    value: "frame-ancestors 'none'; object-src 'none'; base-uri 'self'",
  },
  ...(isProd
    ? [
        {
          key: "Strict-Transport-Security",
          value: "max-age=31536000; includeSubDomains",
        },
      ]
    : []),
];

/** API origin (e.g. http://localhost:3001) for proxying uploaded images */
const apiOrigin = (() => {
  try {
    return new URL(process.env.NEST_API_URL || "http://localhost:3001/api/v1").origin;
  } catch {
    return "http://localhost:3001";
  }
})();

const nextConfig: NextConfig = {
  poweredByHeader: false,
  // Product photos uploaded from the dashboard live on the API server's disk (/uploads);
  // serve them from the site's own domain.
  async rewrites() {
    return [{ source: "/uploads/:path*", destination: `${apiOrigin}/uploads/:path*` }];
  },
  cacheComponents: true,
  partialPrefetching: true,
  experimental: {
    // Two root layouts (admin + storefront [locale]) need a routing-level 404 page
    globalNotFound: true,
    // NEXT_DEV_FS_CACHE=false skips Turbopack's on-disk dev cache (useful when disk space is tight)
    turbopackFileSystemCacheForDev: process.env.NEXT_DEV_FS_CACHE !== "false",
    turbopackFileSystemCacheForBuild: process.env.NEXT_BUILD_FS_CACHE !== "false",
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
  async headers() {
    return [
      { source: "/:path*", headers: securityHeaders },
      // Admin pages and APIs must never be indexed or cached by shared caches
      {
        source: "/admin/:path*",
        headers: [
          { key: "X-Robots-Tag", value: "noindex, nofollow" },
          { key: "Cache-Control", value: "no-store" },
        ],
      },
      {
        source: "/api/:path*",
        headers: [{ key: "X-Robots-Tag", value: "noindex" }],
      },
    ];
  },
};

export default nextConfig;
