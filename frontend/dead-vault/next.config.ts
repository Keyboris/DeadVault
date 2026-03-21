import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
    allowedDevOrigins: ['192.168.1.209', '172.20.10.2'],
    output: "export"
};

export default nextConfig;