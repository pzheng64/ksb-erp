/** @type {import('next').NextConfig} */
process.env.NEXT_TELEMETRY_DISABLED = "1";

const nextConfig = {
  async rewrites() {
    return [{ source: "/api/:path*", destination: "http://127.0.0.1:8001/api/:path*" }];
  },
};

export default nextConfig;
