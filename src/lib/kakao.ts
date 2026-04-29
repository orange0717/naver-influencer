/**
 * 카카오 알림톡 발송 모듈
 *
 * 사전 준비:
 * 1. 카카오 비즈니스 채널 개설
 * 2. 알림톡 템플릿 등록 + 심사
 * 3. 환경변수 설정: KAKAO_REST_API_KEY, KAKAO_SENDER_KEY
 */

interface KakaoAlimtalkParams {
  phone: string;
  templateCode: string;
  variables: Record<string, string>;
}

/**
 * 카카오 알림톡 발송
 * API 키가 설정되지 않으면 건너뛰고 로그만 남김
 */
export async function sendKakaoAlimtalk(params: KakaoAlimtalkParams): Promise<boolean> {
  const apiKey = process.env.KAKAO_REST_API_KEY;
  const senderKey = process.env.KAKAO_SENDER_KEY;

  if (!apiKey || !senderKey) {
    console.log('[kakao] API 키 미설정 - 알림톡 건너뜀');
    return false;
  }

  try {
    const res = await fetch('https://bizapi.kakao.com/v2/sender/send', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        senderKey,
        templateCode: params.templateCode,
        recipientList: [{
          recipientNo: params.phone,
          templateParameter: params.variables,
        }],
      }),
    });

    if (!res.ok) {
      const body = await res.text();
      console.error('[kakao] 알림톡 발송 실패:', res.status, body);
      return false;
    }

    return true;
  } catch (err) {
    console.error('[kakao] 알림톡 발송 에러:', err);
    return false;
  }
}

/**
 * 순위 변동 알림톡 발송
 */
export async function sendKakaoRankAlert(
  phone: string,
  displayName: string,
  changes: { keyword: string; from_rank: number; to_rank: number; type: string }[],
): Promise<boolean> {
  const templateCode = process.env.KAKAO_RANK_TEMPLATE_CODE || 'RANK_CHANGE_001';
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'https://ninfle.kr';

  // 변동 요약 텍스트 생성 (최대 3건)
  const summary = changes.slice(0, 3).map(c => {
    const arrow = c.type === 'new_top3' || c.type === 'rank_up' ? '상승' : '하락';
    return `${c.keyword} ${c.from_rank}위→${c.to_rank}위 (${arrow})`;
  }).join('\n');

  const moreText = changes.length > 3 ? `\n외 ${changes.length - 3}건` : '';

  return sendKakaoAlimtalk({
    phone,
    templateCode,
    variables: {
      name: displayName,
      summary: summary + moreText,
      count: String(changes.length),
      link: `${baseUrl}/my`,
    },
  });
}
