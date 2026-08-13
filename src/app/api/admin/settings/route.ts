/**
 * 관리자 정책설정 API (스펙 §10).
 *  GET  /api/admin/settings          → 유효 정책값 전체 + override 여부
 *  POST /api/admin/settings { key, value } → 단일 key 저장(코드 기본값 override). 저장 후 캐시 즉시 무효화.
 *
 * 관리자만. 값 유효성은 settings.ts getter 가 조회 시 재검증하므로(잘못된 값이면 기본값 폴백),
 * 여기서는 key 화이트리스트와 기초 타입만 확인한다.
 */
import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/admin';
import { getEffectiveSettings, setSetting, SETTING_KEYS } from '@/lib/settings';

export const dynamic = 'force-dynamic';

const ALLOWED = new Set<string>(Object.values(SETTING_KEYS));

export async function GET(req: NextRequest) {
  const admin = await requireAdmin(req);
  if (admin.error) return admin.error;
  const settings = await getEffectiveSettings();
  return NextResponse.json({ settings });
}

export async function POST(req: NextRequest) {
  const admin = await requireAdmin(req);
  if (admin.error) return admin.error;

  let body: { key?: string; value?: unknown };
  try {
    body = (await req.json()) as { key?: string; value?: unknown };
  } catch {
    return NextResponse.json({ error: '잘못된 요청 본문입니다.' }, { status: 400 });
  }

  const { key, value } = body;
  if (!key || !ALLOWED.has(key)) {
    return NextResponse.json({ error: '허용되지 않은 설정 키입니다.' }, { status: 400 });
  }
  if (value === undefined || value === null) {
    return NextResponse.json({ error: 'value 가 필요합니다.' }, { status: 400 });
  }

  try {
    await setSetting(key as (typeof SETTING_KEYS)[keyof typeof SETTING_KEYS], value, admin.authUser.authId);
  } catch (e) {
    console.error('[/api/admin/settings] set failed:', e);
    return NextResponse.json({ error: '설정 저장에 실패했습니다.' }, { status: 500 });
  }

  // 저장 즉시 최신 스냅샷 반환
  const settings = await getEffectiveSettings();
  return NextResponse.json({ ok: true, settings });
}
