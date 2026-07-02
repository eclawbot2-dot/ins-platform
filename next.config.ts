import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["pg", "@prisma/adapter-pg"],
  experimental: {
    serverActions: {
      // Local dev + public Cloudflare-tunnel host. The app is reached at
      // https://ins.jahdev.com but the server binds localhost:3220.
      allowedOrigins: ["localhost:3220", "ins.jahdev.com"],
    },
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
          // HSTS — this app carries sensitive PII (clients, policies, claims,
          // commissions) and is only ever reached over HTTPS (ins.jahdev.com
          // via the Cloudflare tunnel; portal.taboragency.com pending). Pin
          // the browser to HTTPS so a downgrade/MITM can't strip TLS. Scoped
          // to this host + its own subdomains only (not sibling *.jahdev.com).
          // `preload` is intentionally omitted (shared parent-domain risk).
          { key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" },
        ],
      },
    ];
  },
};

export default nextConfig;
