import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

/**
 * 프로덕션에 올라간 빌드가 어느 Git 커밋인지 확인용 (Vercel 환경변수 기준).
 * 배포 반영 여부는 https://ninfle.kr/api/build-info 등으로 확인하세요.
 */
export function GET() {
  return NextResponse.json(
    {
      commit: process.env.VERCEL_GIT_COMMIT_SHA ?? null,
      ref: process.env.VERCEL_GIT_COMMIT_REF ?? null,
      env: process.env.VERCEL_ENV ?? null,
    },
    {
      headers: {
        'Cache-Control': 'no-store, max-age=0',
      },
    }
  );
}
