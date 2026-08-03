import type { NextConfig } from "next";
import path from "path";

function resolveApiUrl() {
  const configured = process.env.API_URL?.replace(/\/$/, "");

  if (process.env.NODE_ENV === "production") {
    return configured ?? "http://localhost:3001";
  }

  // In local dev, always proxy to the local API unless explicitly another local URL.
  if (
    configured &&
    (configured.includes("localhost") || configured.includes("127.0.0.1"))
  ) {
    return configured;
  }

  return "http://localhost:3001";
}

const apiUrl = resolveApiUrl();

if (process.env.NODE_ENV !== "production") {
  console.log(`[web] Proxying /api/* to ${apiUrl}`);
}

const nextConfig: NextConfig = {
  outputFileTracingRoot: path.join(__dirname, "../.."),
  transpilePackages: ["@frog1/shared", "@shopify/polaris", "@shopify/polaris-icons"],
  async rewrites() {
    return [
      {
        source: "/api/:path*",
        destination: `${apiUrl}/api/:path*`,
      },
    ];
  },
};

export default nextConfig;
