import { redirect } from 'next/navigation';

export const dynamic = 'force-dynamic';

/**
 * 2026-08-08부터 N인플 AI는 홈(/)이 담당 — 이 경로는 기존 링크/북마크 호환용 리다이렉트만 유지.
 */
export default function AiConsultantRedirect() {
  redirect('/');
}
