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
};

export default nextConfig;
