import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@rentmate/types", "@rentmate/ui"],
};

export default nextConfig;
