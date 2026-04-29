import { Resend } from 'resend';

let _resend: Resend | null = null;
function getResend() {
  if (!_resend) {
    _resend = new Resend(process.env.RESEND_API_KEY);
  }
  return _resend;
}

const FROM_EMAIL = process.env.RESEND_FROM_EMAIL || 'N인플 <orange@orangelibrary.co.kr>';

/** HTML 특수문자 이스케이프 */
function escapeHtml(str: string): string {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/** 데모 인증번호 이메일 */
export async function sendDemoVerificationEmail(to: string, code: string) {
  const { error } = await getResend().emails.send({
    from: FROM_EMAIL,
    to,
    subject: `[N인플] 데모 체험 인증번호: ${code}`,
    html: `
      <div style="max-width:520px;margin:0 auto;font-family:'Apple SD Gothic Neo','Noto Sans KR',sans-serif;color:#333">
        <div style="background:#c8816b;padding:24px 20px;border-radius:12px 12px 0 0;text-align:center">
          <h1 style="color:#fff;font-size:20px;margin:0">N인플</h1>
        </div>
        <div style="padding:32px 24px;background:#fff;border:1px solid #eee;border-top:none;border-radius:0 0 12px 12px">
          <p style="font-size:16px;font-weight:bold;margin:0 0 16px">데모 체험 인증번호</p>
          <p style="font-size:14px;line-height:1.7;color:#555;margin:0 0 24px">
            아래 인증번호를 입력하면 3일간 무료 데모 체험이 시작됩니다.
          </p>
          <div style="text-align:center;margin:24px 0;padding:20px;background:#f8f4f2;border-radius:12px">
            <p style="font-size:32px;font-weight:900;letter-spacing:8px;color:#c8816b;margin:0">${code}</p>
          </div>
          <p style="font-size:12px;color:#999;text-align:center;margin:16px 0 0">
            인증번호는 10분간 유효합니다.
          </p>
        </div>
      </div>
    `,
  });
  if (error) {
    console.error('[email] 데모 인증번호 발송 실패:', error);
    throw new Error(error.message || '이메일 발송 실패');
  }
}

/** 데모 만료 알림 이메일 */
export async function sendDemoExpiredEmail(to: string, displayName: string) {
  const { error } = await getResend().emails.send({
    from: FROM_EMAIL,
    to,
    subject: `[N인플] ${displayName}님의 데모 체험이 종료되었습니다`,
    html: `
      <div style="max-width:520px;margin:0 auto;font-family:'Apple SD Gothic Neo','Noto Sans KR',sans-serif;color:#333">
        <div style="background:#c8816b;padding:24px 20px;border-radius:12px 12px 0 0;text-align:center">
          <h1 style="color:#fff;font-size:20px;margin:0">N인플</h1>
        </div>
        <div style="padding:32px 24px;background:#fff;border:1px solid #eee;border-top:none;border-radius:0 0 12px 12px">
          <p style="font-size:16px;font-weight:bold;margin:0 0 16px">${displayName}님, 안녕하세요.</p>
          <p style="font-size:14px;line-height:1.7;color:#555;margin:0 0 24px">
            이용하셨던 데모 체험 기간이 종료되었습니다.<br>
            회원가입 후 내 인플루언서 데이터로 대시보드를 이용해보세요.
          </p>
          <div style="text-align:center;margin:24px 0">
            <a href="https://ninfle.kr/auth/signup"
               style="display:inline-block;padding:14px 32px;background:#c8816b;color:#fff;text-decoration:none;border-radius:8px;font-size:14px;font-weight:bold">
              무료 회원가입
            </a>
          </div>
          <hr style="border:none;border-top:1px solid #eee;margin:24px 0">
          <p style="font-size:12px;color:#999;text-align:center;margin:0">
            본 메일은 N인플 데모 체험 시 입력하신 이메일로 발송되었습니다.
          </p>
        </div>
      </div>
    `,
  });
  if (error) {
    console.error('[email] 데모 만료 알림 발송 실패:', error);
    throw new Error(error.message || '이메일 발송 실패');
  }
}

/** 순위 변동 알림 이메일 */
export interface RankChangeItem {
  keyword: string;
  keyword_id: string;
  from_rank: number;
  to_rank: number;
  change: number;
  type: 'new_top3' | 'lost_top3' | 'rank_up' | 'rank_down';
}

export async function sendRankChangeEmail(
  to: string,
  displayName: string,
  changes: RankChangeItem[],
  snapshotDate: string,
) {
  const top3Items = changes.filter(c => c.type === 'new_top3' || c.type === 'lost_top3');
  const otherItems = changes.filter(c => c.type === 'rank_up' || c.type === 'rank_down');

  const safeName = escapeHtml(displayName);

  const renderItem = (item: RankChangeItem) => {
    const isUp = item.type === 'new_top3' || item.type === 'rank_up';
    const color = isUp ? '#2E8B57' : '#D94848';
    const arrow = isUp ? '↑' : '↓';
    const label = item.type === 'new_top3' ? 'TOP3 진입' : item.type === 'lost_top3' ? 'TOP3 이탈' : isUp ? '상승' : '하락';
    const safeKeyword = escapeHtml(item.keyword);
    return `
      <tr>
        <td style="padding:8px 12px;border-bottom:1px solid #f0e8e5;font-size:14px">${safeKeyword}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #f0e8e5;font-size:14px;text-align:center">${item.from_rank}위</td>
        <td style="padding:8px 12px;border-bottom:1px solid #f0e8e5;font-size:14px;text-align:center;color:${color};font-weight:bold">${arrow} ${item.to_rank}위</td>
        <td style="padding:8px 12px;border-bottom:1px solid #f0e8e5;font-size:12px;text-align:center"><span style="background:${isUp ? '#e8f5e9' : '#fde8e8'};color:${color};padding:2px 8px;border-radius:10px;font-weight:bold">${label}</span></td>
      </tr>`;
  };

  const tableHeader = `
    <table style="width:100%;border-collapse:collapse;margin:16px 0">
      <thead>
        <tr style="background:#f8f4f2">
          <th style="padding:8px 12px;text-align:left;font-size:12px;color:#8C7A6E;border-bottom:2px solid #e8ddd8">키워드</th>
          <th style="padding:8px 12px;text-align:center;font-size:12px;color:#8C7A6E;border-bottom:2px solid #e8ddd8">이전</th>
          <th style="padding:8px 12px;text-align:center;font-size:12px;color:#8C7A6E;border-bottom:2px solid #e8ddd8">현재</th>
          <th style="padding:8px 12px;text-align:center;font-size:12px;color:#8C7A6E;border-bottom:2px solid #e8ddd8">상태</th>
        </tr>
      </thead>
      <tbody>`;

  let body = '';

  if (top3Items.length > 0) {
    body += `<p style="font-size:14px;font-weight:bold;margin:20px 0 4px;color:#D4A017">TOP3 변동</p>`;
    body += tableHeader + top3Items.map(renderItem).join('') + '</tbody></table>';
  }

  if (otherItems.length > 0) {
    body += `<p style="font-size:14px;font-weight:bold;margin:20px 0 4px;color:#8C7A6E">순위 변동 (3단계 이상)</p>`;
    body += tableHeader + otherItems.map(renderItem).join('') + '</tbody></table>';
  }

  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'https://ninfle.kr';

  const { error } = await getResend().emails.send({
    from: FROM_EMAIL,
    to,
    subject: `[N인플] ${displayName}님의 순위 변동 알림 (${changes.length}건)`,
    html: `
      <div style="max-width:520px;margin:0 auto;font-family:'Apple SD Gothic Neo','Noto Sans KR',sans-serif;color:#333">
        <div style="background:#c8816b;padding:24px 20px;border-radius:12px 12px 0 0;text-align:center">
          <h1 style="color:#fff;font-size:20px;margin:0">N인플</h1>
        </div>
        <div style="padding:32px 24px;background:#fff;border:1px solid #eee;border-top:none;border-radius:0 0 12px 12px">
          <p style="font-size:16px;font-weight:bold;margin:0 0 8px">${safeName}님, 오늘의 순위 변동 알림입니다.</p>
          <p style="font-size:13px;color:#999;margin:0 0 16px">${snapshotDate} 기준</p>
          ${body}
          <div style="text-align:center;margin:28px 0 16px">
            <a href="${baseUrl}/my"
               style="display:inline-block;padding:14px 32px;background:#c8816b;color:#fff;text-decoration:none;border-radius:8px;font-size:14px;font-weight:bold">
              대시보드에서 확인하기
            </a>
          </div>
          <hr style="border:none;border-top:1px solid #eee;margin:24px 0">
          <p style="font-size:11px;color:#999;text-align:center;margin:0">
            본 메일은 N인플 순위 알림 설정에 의해 발송되었습니다.<br>
            알림 설정은 <a href="${baseUrl}/profile" style="color:#c8816b">프로필</a>에서 변경할 수 있습니다.
          </p>
        </div>
      </div>
    `,
  });
  if (error) {
    console.error('[email] 순위 변동 알림 발송 실패:', error);
    throw new Error(error.message || '이메일 발송 실패');
  }
}

/** 데모 만료 3일 전 리마인더 이메일 */
export async function sendDemoReminderEmail(to: string, displayName: string, daysLeft: number) {
  const { error } = await getResend().emails.send({
    from: FROM_EMAIL,
    to,
    subject: `[N인플] 데모 체험이 ${daysLeft}일 후 종료됩니다`,
    html: `
      <div style="max-width:520px;margin:0 auto;font-family:'Apple SD Gothic Neo','Noto Sans KR',sans-serif;color:#333">
        <div style="background:#c8816b;padding:24px 20px;border-radius:12px 12px 0 0;text-align:center">
          <h1 style="color:#fff;font-size:20px;margin:0">N인플</h1>
        </div>
        <div style="padding:32px 24px;background:#fff;border:1px solid #eee;border-top:none;border-radius:0 0 12px 12px">
          <p style="font-size:16px;font-weight:bold;margin:0 0 16px">${displayName}님, 안녕하세요.</p>
          <p style="font-size:14px;line-height:1.7;color:#555;margin:0 0 24px">
            데모 체험 기간이 <strong>${daysLeft}일</strong> 남았습니다.<br>
            회원가입하시면 내 인플루언서 데이터로 계속 이용할 수 있습니다.
          </p>
          <div style="text-align:center;margin:24px 0">
            <a href="https://ninfle.kr/auth/signup"
               style="display:inline-block;padding:14px 32px;background:#c8816b;color:#fff;text-decoration:none;border-radius:8px;font-size:14px;font-weight:bold">
              무료 회원가입
            </a>
          </div>
          <hr style="border:none;border-top:1px solid #eee;margin:24px 0">
          <p style="font-size:12px;color:#999;text-align:center;margin:0">
            본 메일은 N인플 데모 체험 시 입력하신 이메일로 발송되었습니다.
          </p>
        </div>
      </div>
    `,
  });
  if (error) {
    console.error('[email] 데모 리마인더 발송 실패:', error);
    throw new Error(error.message || '이메일 발송 실패');
  }
}
