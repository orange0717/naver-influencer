import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs";

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: '**.naver.com' },
      { protocol: 'https', hostname: '**.pstatic.net' },
    ],
  },
  // 정식 도메인(ninfle.kr) 외 Vercel 자동 도메인 접근은 모두 ninfle.kr 로 301 영구 리다이렉트
  // (기존 검색 색인 자산을 신규 도메인으로 자연 이전 + 중복 콘텐츠 방지)
  async redirects() {
    return [
      {
        source: '/:path*',
        has: [{ type: 'host', value: 'naver-influencer.vercel.app' }],
        destination: 'https://ninfle.kr/:path*',
        permanent: true,
      },
      {
        source: '/:path*',
        has: [{ type: 'host', value: '(.*)-orangelibrary\\.vercel\\.app' }],
        destination: 'https://ninfle.kr/:path*',
        permanent: true,
      },
    ];
  },
};

export default withSentryConfig(nextConfig, {
  silent: true,
  org: process.env.SENTRY_ORG || '',
  project: process.env.SENTRY_PROJECT || '',
  sourcemaps: {
    disable: true,
  },
});
