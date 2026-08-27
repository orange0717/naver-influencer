/**
 * judge-accounts.ts
 * 외부 심사위원용 한시 계정 — 서버 공용 헬퍼
 *
 * 인증은 기존 Supabase Auth(이메일+비밀번호)를 그대로 쓴다. 새 인증 경로를
 * 만들지 않으며, 비밀번호 평문은 발급 응답에 1회 실릴 뿐 DB·로그 어디에도
 * 남기지 않는다(해시는 auth.users 에만 존재).
 *
 * 권한 모델
 *   - 열람 범위: 일반 회원과 동일한 전 메뉴(§2). 별도 화이트리스트 게이트를
 *     두지 않으므로 아래 JUDGE_REVIEW_ROUTES 는 "점검 대상 목록"일 뿐
 *     접근 제어에 쓰이지 않는다.
 *   - 유료 열람: users.subscription_plan = 'INFLUENCER' + subscription_expires_at
 *     = 심사 종료일. 기존 구독 판정(hasActivePaidPlanByUserId)을 그대로 탄다.
 *   - 관리자 권한은 어떤 경우에도 부여하지 않는다.
 */

import { randomInt } from 'crypto';
import { NextResponse } from 'next/server';
import type { SupabaseClient } from '@supabase/supabase-js';

/** 심사위원에게 부여하는 플랜 — 유료 전용 화면까지 실제 동작을 보게 한다 */
export const JUDGE_PLAN = 'INFLUENCER' as const;

/**
 * §2 점검 대상 경로. ninfle.kr 사이드바 그룹 순서를 그대로 따른다.
 * 접근 허용 범위는 "전 경로 개방"으로 확정되었으므로 이 목록은 점검
 * (POST /api/admin/judges/:id/verify)에서만 쓰인다.
 */
export const JUDGE_REVIEW_ROUTES: ReadonlyArray<{ group: string; path: string }> = [
  { group: '대시보드', path: '/dashboard' },
  { group: '대시보드', path: '/my/missing-posts' },
  { group: '대시보드', path: '/my/keyword-ranking' },
  { group: '대시보드', path: '/my/naver-mate' },

  { group: '인플루언서', path: '/my' },
  { group: '인플루언서', path: '/topics' },
  { group: '인플루언서', path: '/my/fans' },

  { group: '포스팅', path: '/dashboard/writing/spellcheck' },
  { group: '포스팅', path: '/my/naver-mate/quality-evaluate' },

  { group: '네이버 데이터', path: '/naver-mate-ranking' },
  { group: '네이버 데이터', path: '/stats' },
  { group: '네이버 데이터', path: '/keywords' },
  { group: '네이버 데이터', path: '/keywords/recommend' },
  { group: '네이버 데이터', path: '/keywords/blogger' },
  { group: '네이버 데이터', path: '/keywords/bulk' },
  { group: '네이버 데이터', path: '/influencers/free-plan' },
  { group: '네이버 데이터', path: '/influencers' },

  { group: '콘텐츠 도구', path: '/dashboard/writing/content-angles' },
  { group: '콘텐츠 도구', path: '/dashboard/writing/titles' },
  { group: '콘텐츠 도구', path: '/dashboard/writing/color-palette' },
  { group: '콘텐츠 도구', path: '/image-editor' },
  { group: '콘텐츠 도구', path: '/dashboard/content/youtube' },
  { group: '콘텐츠 도구', path: '/dashboard/content/shortform' },
  { group: '콘텐츠 도구', path: '/dashboard/youtube-stt' },
  { group: '콘텐츠 도구', path: '/dashboard/google-indexing' },
];

/* ── 에러 규약 ────────────────────────────────────────────────
   { error: { code, message } } 고정. 인증 실패 사유는 세분화하지 않는다
   (계정 없음 / 비밀번호 불일치를 구분해 노출하지 않음).
──────────────────────────────────────────────────────────── */
export function judgeError(code: string, message: string, status: number): NextResponse {
  return NextResponse.json({ error: { code, message } }, { status });
}

/**
 * 발급용 임시 비밀번호.
 * 사람이 받아 적을 수 있어야 하므로 혼동 문자(0/O/1/l/I)를 뺀 알파벳에서
 * 20자를 뽑는다(≈ 약 100비트). Math.random 이 아닌 CSPRNG 사용.
 */
export function generateJudgePassword(): string {
  const ALPHABET = 'abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let out = '';
  for (let i = 0; i < 20; i++) out += ALPHABET[randomInt(ALPHABET.length)];
  // 비밀번호 정책(대/소/숫자) 충족을 형식적으로 보장
  return `${out}-Nj7`;
}

export function isExpired(expiresAt: string | null | undefined): boolean {
  if (!expiresAt) return true;
  const t = new Date(expiresAt).getTime();
  return Number.isNaN(t) || t <= Date.now();
}

/**
 * 계정 차단 — 즉시 비활성화·만료 처리 공통 경로.
 *
 * 세 가지를 한꺼번에 끊는다.
 *   1) auth.users 밴 → 토큰 갱신·신규 로그인 차단. 이 코드베이스의 서버
 *      인증은 supabase.auth.getUser() 로 매번 Auth 서버에 물어보므로
 *      이미 발급된 액세스 토큰도 다음 요청에서 바로 막힌다.
 *   2) user_sessions 행 삭제 → 미들웨어의 기기 세션 검증 탈락.
 *   3) 구독 플랜 회수 → 유료 화면 접근 차단.
 *
 * 주의: verifySession 은 결과를 isolate 당 30초 캐시한다. 이미 진행 중이던
 * 요청 흐름에서 최대 30초의 잔여 창이 있을 수 있다(1)의 Auth 밴은 즉시 적용).
 */
export async function revokeJudgeAccess(
  supabase: SupabaseClient,
  params: { authId: string; userId: string },
): Promise<{ ok: boolean; failures: string[] }> {
  const failures: string[] = [];

  const { error: banError } = await supabase.auth.admin.updateUserById(params.authId, {
    ban_duration: '876000h', // 100년 = 사실상 영구
  });
  if (banError) failures.push(`ban:${banError.message}`);

  const { error: sessionError } = await supabase
    .from('user_sessions')
    .delete()
    .eq('user_id', params.authId);
  if (sessionError) failures.push(`sessions:${sessionError.message}`);

  const { error: planError } = await supabase
    .from('users')
    .update({ subscription_plan: null, subscription_expires_at: null })
    .eq('id', params.userId);
  if (planError) failures.push(`plan:${planError.message}`);

  return { ok: failures.length === 0, failures };
}

/** 비활성화된 계정을 심사 기간 내에서 되살린다 */
export async function restoreJudgeAccess(
  supabase: SupabaseClient,
  params: { authId: string; userId: string; expiresAt: string },
): Promise<{ ok: boolean; failures: string[] }> {
  const failures: string[] = [];

  const { error: banError } = await supabase.auth.admin.updateUserById(params.authId, {
    ban_duration: 'none',
  });
  if (banError) failures.push(`unban:${banError.message}`);

  const { error: planError } = await supabase
    .from('users')
    .update({ subscription_plan: JUDGE_PLAN, subscription_expires_at: params.expiresAt })
    .eq('id', params.userId);
  if (planError) failures.push(`plan:${planError.message}`);

  return { ok: failures.length === 0, failures };
}
