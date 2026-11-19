import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  async rewrites() {
    return [
      {
        source: "/api/:path*",
        destination: `${process.env.API_ORIGIN ?? "http://127.0.0.1:8765"}/api/:path*`,
      },
    ];
  },
};

export default nextConfig;
