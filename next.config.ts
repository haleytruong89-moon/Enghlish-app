import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  poweredByHeader: false,
  reactStrictMode: true,
  // Studio B1: the extraction route reads prompts/*.md at run time (lib/ai/prompts.ts).
  outputFileTracingIncludes: { "/api/learners/[id]/studio/drafts": ["./prompts/**/*"] },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          // X-Frame-Options / frame-ancestors: decide in S13 once the Launcher slot type is known.
          // Microphone stays allowed for the on-device speaking studio (S10); nothing else.
          { key: "Permissions-Policy", value: "camera=(), geolocation=(), microphone=(self)" },
        ],
      },
    ];
  },
};

export default nextConfig;
