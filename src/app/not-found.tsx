import Link from 'next/link';

/**
 * 404 전용 화면.
 *
 * 이게 없으면 Next.js 기본 페이지("This page could not be found.")가 그대로 나온다.
 * 한국어 서비스에서 영문 한 줄만 덩그러니 뜨고, 돌아갈 링크조차 없어서 사용자는
 * 브라우저 뒤로가기 말고는 할 수 있는 게 없었다. 오류 화면(error.tsx)과 달리
 * '다시 시도'는 의미가 없으므로(주소가 없는 건 재시도로 안 풀린다) 이동 동선만 준다.
 */
export default function NotFound() {
  return (
    <div className="flex min-h-[50vh] items-center justify-center px-4">
      <div className="w-full max-w-md rounded-lg border border-border bg-surface p-8 text-center shadow-sm">
        <p className="font-rank text-3xl font-bold text-accent">404</p>
        <h2 className="mt-3 text-lg font-semibold">주소를 찾을 수 없습니다</h2>
        <p className="mt-2 text-sm text-dim leading-relaxed">
          주소가 바뀌었거나 삭제된 페이지입니다. 주소를 다시 확인해 주세요.
        </p>
        <div className="mt-6 flex items-center justify-center gap-2">
          <Link
            href="/"
            className="rounded-lg bg-accent px-5 py-2 text-sm font-medium text-white transition-colors hover:bg-accent-hover"
          >
            홈으로
          </Link>
          <Link
            href="/notice"
            className="rounded-lg border border-border bg-bg px-5 py-2 text-sm font-medium text-ink transition-colors hover:bg-surface"
          >
            공지사항
          </Link>
        </div>
      </div>
    </div>
  );
}
