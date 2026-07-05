import { redirect } from 'next/navigation';

function sanitizeRedirect(raw: string | undefined): string | null {
  if (!raw) return null;
  if (!raw.startsWith('/')) return null;
  if (raw.startsWith('//') || raw.startsWith('/\\')) return null;
  return raw;
}

/**
 * 별도 회원가입 페이지는 더 이상 사용하지 않는다. 메인페이지 로그인 모달의 회원가입
 * 탭으로 대체되어, 기존 `/auth/signup` 링크는 모두 홈으로 보내고 모달을 자동으로 연다.
 */
export default async function SignupPage({
  searchParams,
}: {
  searchParams: Promise<{ redirect?: string }>;
}) {
  const params = await searchParams;

  const qs = new URLSearchParams();
  qs.set('authModal', 'signup');
  const safeRedirect = sanitizeRedirect(params.redirect);
  if (safeRedirect) qs.set('redirect', safeRedirect);

  redirect(`/?${qs.toString()}`);
}
