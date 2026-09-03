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
      // ── 메뉴 개편(2026-08-12) 이동/폐지 라우트 호환 (스펙 23) ──
      // 즐겨찾기·내부 링크가 깨지지 않도록 기존 URL을 새 위치로 보낸다.
      // 기능 통합(폐지)은 되돌릴 여지가 있으므로 캐시가 영구 고정되는 308 대신 307(임시)을 쓴다.
      {
        // 옛 "블로그 글 심층피드백"(클로드 채팅) → 통합 "글 심층피드백"(정밀 진단)
        source: '/dashboard/claude',
        destination: '/my/naver-mate/quality-evaluate',
        permanent: false,
      },
      {
        // "교정·교열·윤문" 전용 메뉴 폐지(스펙 10) → 맞춤법 검사로 유도
        source: '/dashboard/writing/rewrite',
        destination: '/dashboard/writing/spellcheck',
        permanent: false,
      },
      {
        // 기업용 온라인 상담 폼 폐지(2026-09-03) → 이용권의 기업용 섹션으로 보낸다.
        // 색인돼 있던 공개 페이지라 위 두 건과 달리 영구(308)로 넘겨 검색 신호를 이전한다.
        // 하위 /enterprise/signup 등 결제 경로는 정확 일치가 아니라 영향받지 않는다.
        source: '/enterprise',
        destination: '/subscribe#enterprise',
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
