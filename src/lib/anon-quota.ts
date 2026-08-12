import { createHash } from 'crypto';
import type { NextRequest } from 'next/server';
import { createServiceClient } from './supabase-server';
import { getClientIp } from './rate-limit';

/**
 * 비회원 도구 호출 일일 IP+UA 캡 체크.
 * Supabase RPC `check_tool_anon_quota`를 호출해 카운트 +1 후 한도 초과 여부를 반환.
 *
 * 사용 예:
 *   const quota = await checkToolAnonQuota(request, 'search-volume', 30);
 *   if (!quota.allowed) return NextResponse.json({ error: '...', limitExceeded: true }, { status: 429 });
 */
export async function checkToolAnonQuota(
  request: NextRequest,
  tool: string,
  max: number = 30,
): Promise<{ allowed: boolean; currentCount: number; degraded: boolean }> {
  const ip = getClientIp(request);
  const ua = request.headers.get('user-agent') || '';
  const ipHash = sha256Hex(ip);
  const uaHash = sha256Hex(ua);

  try {
    const supabase = createServiceClient();
    const { data, error } = await supabase.rpc('check_tool_anon_quota', {
      p_tool: tool,
      p_ip_hash: ipHash,
      p_ua_hash: uaHash,
      p_max: max,
    });

    if (error) {
      console.error('[checkToolAnonQuota] RPC error:', error.message);
      // 장애 시 기본 통과 (가용성 우선). 단 degraded=true 로 표시해, 외부 유료 API를 태우는
      // 엔드포인트는 이 신호를 보고 fail-closed 를 선택할 수 있게 한다(무료 한도 우회 비용 폭탄 방지).
      return { allowed: true, currentCount: 0, degraded: true };
    }

    const row = Array.isArray(data) ? data[0] : data;
    return {
      allowed: row?.allowed ?? true,
      currentCount: row?.current_count ?? 0,
      degraded: false,
    };
  } catch (err) {
    console.error('[checkToolAnonQuota] unexpected error:', err);
    return { allowed: true, currentCount: 0, degraded: true };
  }
}

function sha256Hex(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}
