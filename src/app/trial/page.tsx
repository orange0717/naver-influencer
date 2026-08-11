import { redirect } from 'next/navigation';

/**
 * /trial — 2026-08-08 프리미엄 모델 전환으로 자가발급 7일 체험 폐지.
 * 회원가입 없이도 하루 3회 무료로 바로 체험 가능하므로 별도 진입 페이지가 필요 없다.
 * 기존 북마크/외부 링크 호환을 위해 홈으로 리다이렉트만 유지.
 */
export default function TrialPage() {
  redirect('/');
}
