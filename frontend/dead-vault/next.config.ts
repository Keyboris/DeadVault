import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  output: "export",
    allowedDevOrigins: ['192.168.1.209', '172.20.10.2']
};

export default nextConfig;