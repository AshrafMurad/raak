import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Docker builds set NEXT_OUTPUT_STANDALONE=1 so `next build` also emits the
  // relocatable `.next/standalone` server (frontend/Dockerfile runs
  // `node server.js`). Local builds keep the default output: this Next version
  // explicitly refuses `next start` when output is 'standalone', and the
  // browser harness starts the production server with `next start`.
  ...(process.env['NEXT_OUTPUT_STANDALONE'] === '1' ? { output: 'standalone' as const } : {}),
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [{ key: 'Referrer-Policy', value: 'no-referrer' }],
      },
    ];
  },
};

export default nextConfig;
