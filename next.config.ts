import type { NextConfig } from "next";
import path from "path";

const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      bodySizeLimit: "50mb",
    },
  },
  serverExternalPackages: ["sharp", "bcryptjs"],
  turbopack: {
    root: path.resolve(__dirname),
  },
  outputFileTracingExcludes: {
    "*": ["./data/media/**"],
  },
  typescript: {
    ignoreBuildErrors: false,
  },

  /**
   * CORS headers for `/api/*` so external sites can call the gateway with an
   * API key (e.g. `X-API-Key`) without browser preflight rejections.
   * Auth is still enforced inside each route via getAuthenticatedUser().
   */
  async headers() {
    // Origin allowed for CORS /api/*.
    // Default "*" (preserves existing behavior). To restrict it, set
    // CORS_ALLOW_ORIGIN=https://your-domain.com and restart. Note: server-to-server
    // calls using X-API-Key are NOT affected by CORS (they have no Origin).
    const allowOrigin = process.env.CORS_ALLOW_ORIGIN || "*";
    return [
      {
        source: "/api/:path*",
        headers: [
          { key: "Access-Control-Allow-Origin", value: allowOrigin },
          {
            key: "Access-Control-Allow-Methods",
            value: "GET, POST, PUT, PATCH, DELETE, OPTIONS",
          },
          {
            key: "Access-Control-Allow-Headers",
            value:
              "Content-Type, Authorization, X-API-Key, X-Requested-With, Accept",
          },
          { key: "Access-Control-Max-Age", value: "86400" },
          ...(allowOrigin !== "*" ? [{ key: "Vary", value: "Origin" }] : []),
        ],
      },
      {
        // Security headers untuk semua halaman/route.
        // HSTS hanya dihormati browser saat HTTPS (di localhost HTTP diabaikan → aman).
        source: "/(.*)",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
          { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
        ],
      },
    ];
  },
};

export default nextConfig;
