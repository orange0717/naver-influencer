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
  // /api/cron/*은 제외: Vercel Cron 스케줄러는 배포 전용 URL(*-orangelibrary.vercel.app)로
  // 호출하는데 크론 요청은 리다이렉트를 따라가지 않아 이 규칙에 걸리면 실제 함수가 실행되지
  // 않고 조용히 끝나버린다 (Vercel Support Agent 진단으로 확인, 2026-07-13).
  async redirects() {
    return [
      {
        source: '/:path((?!api/cron).*)',
        has: [{ type: 'host', value: 'naver-influencer.vercel.app' }],
        destination: 'https://ninfle.kr/:path',
        permanent: true,
      },
      {
        source: '/:path((?!api/cron).*)',
        has: [{ type: 'host', value: '(.*)-orangelibrary\\.vercel\\.app' }],
        destination: 'https://ninfle.kr/:path',
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
