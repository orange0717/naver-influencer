import { redirect } from 'next/navigation';

function sanitizeRedirect(raw: string | undefined): string | null {
  if (!raw) return null;
  if (!raw.startsWith('/')) return null;
  if (raw.startsWith('//') || raw.startsWith('/\\')) return null;
  return raw;
}

/**
 * 별도 로그인 페이지는 더 이상 사용하지 않는다. 메인페이지 로그인 모달로 대체되어,
 * 기존에 `/auth/login` 으로 걸린 링크·미들웨어 리다이렉트는 모두 여기서 홈으로 보내고
 * 모달을 자동으로 연다. (레이아웃 없이 리다이렉트만 수행하므로 별도 UI 렌더링은 없음)
 */
export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ redirect?: string; reason?: string }>;
}) {
  const params = await searchParams;

  const qs = new URLSearchParams();
  qs.set('authModal', 'login');
  const safeRedirect = sanitizeRedirect(params.redirect);
  if (safeRedirect) qs.set('redirect', safeRedirect);
  if (params.reason) qs.set('reason', params.reason);

  redirect(`/?${qs.toString()}`);
}
