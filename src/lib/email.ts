import { Resend } from 'resend';
import { INVITE_TTL_DAYS } from '@/lib/enterprise-invite';

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

/** 구독 만료 7일 전 리마인더 */
export async function sendSubscriptionReminderEmail(
  to: string,
  displayName: string,
  daysLeft: number,
  expiresAt: string,
) {
  const safeName = escapeHtml(displayName);
  const expiresDate = new Date(expiresAt).toLocaleDateString('ko-KR');
  const { error } = await getResend().emails.send({
    from: FROM_EMAIL,
    to,
    subject: `[N인플] 구독이 ${daysLeft}일 후 만료됩니다`,
    html: `
      <div style="max-width:520px;margin:0 auto;font-family:'Apple SD Gothic Neo','Noto Sans KR',sans-serif;color:#333">
        <div style="background:#c8816b;padding:24px 20px;border-radius:12px 12px 0 0;text-align:center">
          <h1 style="color:#fff;font-size:20px;margin:0">N인플</h1>
        </div>
        <div style="padding:32px 24px;background:#fff;border:1px solid #eee;border-top:none;border-radius:0 0 12px 12px">
          <p style="font-size:16px;font-weight:bold;margin:0 0 16px">${safeName}님, 안녕하세요.</p>
          <p style="font-size:14px;line-height:1.7;color:#555;margin:0 0 24px">
            구독 만료까지 <strong>${daysLeft}일</strong> 남았습니다.<br>
            만료일: <strong>${expiresDate}</strong><br><br>
            지금 미리 갱신하시면 끊김 없이 키워드 챌린지 분석을 계속 이용할 수 있습니다.
          </p>
          <div style="text-align:center;margin:24px 0">
            <a href="https://ninfle.kr/subscribe"
               style="display:inline-block;padding:14px 32px;background:#c8816b;color:#fff;text-decoration:none;border-radius:8px;font-size:14px;font-weight:bold">
              구독 갱신하기
            </a>
          </div>
          <hr style="border:none;border-top:1px solid #eee;margin:24px 0">
          <p style="font-size:12px;color:#999;text-align:center;margin:0">
            본 메일은 N인플 가입 시 입력하신 이메일로 발송되었습니다.
          </p>
        </div>
      </div>
    `,
  });
  if (error) {
    console.error('[email] 구독 리마인더 발송 실패:', error);
    throw new Error(error.message || '이메일 발송 실패');
  }
}

/** 구독 만료 당일 알림 */
export async function sendSubscriptionExpiredEmail(to: string, displayName: string) {
  const safeName = escapeHtml(displayName);
  const { error } = await getResend().emails.send({
    from: FROM_EMAIL,
    to,
    subject: `[N인플] 구독이 만료되었습니다`,
    html: `
      <div style="max-width:520px;margin:0 auto;font-family:'Apple SD Gothic Neo','Noto Sans KR',sans-serif;color:#333">
        <div style="background:#c8816b;padding:24px 20px;border-radius:12px 12px 0 0;text-align:center">
          <h1 style="color:#fff;font-size:20px;margin:0">N인플</h1>
        </div>
        <div style="padding:32px 24px;background:#fff;border:1px solid #eee;border-top:none;border-radius:0 0 12px 12px">
          <p style="font-size:16px;font-weight:bold;margin:0 0 16px">${safeName}님, 안녕하세요.</p>
          <p style="font-size:14px;line-height:1.7;color:#555;margin:0 0 24px">
            구독 기간이 만료되어 Free 플랜으로 전환되었습니다.<br>
            계속해서 키워드 챌린지 순위·경쟁자 분석·실시간 알림을 이용하시려면 갱신해주세요.
          </p>
          <div style="text-align:center;margin:24px 0">
            <a href="https://ninfle.kr/subscribe"
               style="display:inline-block;padding:14px 32px;background:#c8816b;color:#fff;text-decoration:none;border-radius:8px;font-size:14px;font-weight:bold">
              구독 갱신하기
            </a>
          </div>
          <hr style="border:none;border-top:1px solid #eee;margin:24px 0">
          <p style="font-size:12px;color:#999;text-align:center;margin:0">
            본 메일은 N인플 가입 시 입력하신 이메일로 발송되었습니다.
          </p>
        </div>
      </div>
    `,
  });
  if (error) {
    console.error('[email] 구독 만료 알림 발송 실패:', error);
    throw new Error(error.message || '이메일 발송 실패');
  }
}

/** 개인정보처리방침 개정 안내 */
export async function sendPrivacyPolicyUpdateEmail(
  to: string,
  displayName: string,
  policyVersion: string,
) {
  const safeName = escapeHtml(displayName);
  const safeVer = escapeHtml(policyVersion);
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'https://ninfle.kr';
  const { error } = await getResend().emails.send({
    from: FROM_EMAIL,
    to,
    subject: `[N인플] 개인정보처리방침이 개정되었습니다 (${safeVer})`,
    html: `
      <div style="max-width:520px;margin:0 auto;font-family:'Apple SD Gothic Neo','Noto Sans KR',sans-serif;color:#333">
        <div style="background:#c8816b;padding:24px 20px;border-radius:12px 12px 0 0;text-align:center">
          <h1 style="color:#fff;font-size:20px;margin:0">N인플</h1>
        </div>
        <div style="padding:32px 24px;background:#fff;border:1px solid #eee;border-top:none;border-radius:0 0 12px 12px">
          <p style="font-size:16px;font-weight:bold;margin:0 0 16px">${safeName}님, 안녕하세요.</p>
          <p style="font-size:14px;line-height:1.7;color:#555;margin:0 0 24px">
            개인정보처리방침이 개정되어 안내드립니다.<br>
            <strong>시행 기준 버전: ${safeVer}</strong><br><br>
            자세한 내용은 아래 링크에서 확인하실 수 있습니다.
          </p>
          <div style="text-align:center;margin:24px 0">
            <a href="${baseUrl}/privacy"
               style="display:inline-block;padding:14px 32px;background:#c8816b;color:#fff;text-decoration:none;border-radius:8px;font-size:14px;font-weight:bold">
              개인정보처리방침 보기
            </a>
          </div>
          <hr style="border:none;border-top:1px solid #eee;margin:24px 0">
          <p style="font-size:11px;color:#999;text-align:center;margin:0">
            본 메일은 가입 시 등록하신 이메일로 발송되었습니다.<br>
            수신 설정은 <a href="${baseUrl}/profile#notification-settings" style="color:#c8816b">마이페이지 · 알림 설정</a>에서 변경할 수 있습니다.
          </p>
        </div>
      </div>
    `,
  });
  if (error) {
    console.error('[email] 개인정보처리방침 개정 안내 발송 실패:', error);
    throw new Error(error.message || '이메일 발송 실패');
  }
}

/** 기업 좌석 초대 — 토큰 원문은 이 메일이 유일한 전달 경로다(DB에는 해시만 있다). */
export async function sendOrgInviteEmail(to: string, companyName: string, token: string) {
  const safeCompany = escapeHtml(companyName);
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'https://ninfle.kr';
  const acceptUrl = `${baseUrl}/enterprise/invite?token=${encodeURIComponent(token)}`;
  const { error } = await getResend().emails.send({
    from: FROM_EMAIL,
    to,
    subject: `[N인플] ${companyName}에서 좌석에 초대했습니다`,
    html: `
      <div style="max-width:520px;margin:0 auto;font-family:'Apple SD Gothic Neo','Noto Sans KR',sans-serif;color:#333">
        <div style="background:#c8816b;padding:24px 20px;border-radius:12px 12px 0 0;text-align:center">
          <h1 style="color:#fff;font-size:20px;margin:0">N인플</h1>
        </div>
        <div style="padding:32px 24px;background:#fff;border:1px solid #eee;border-top:none;border-radius:0 0 12px 12px">
          <p style="font-size:16px;font-weight:bold;margin:0 0 16px">${safeCompany}에서 N인플 좌석에 초대했습니다.</p>
          <p style="font-size:14px;line-height:1.7;color:#555;margin:0 0 24px">
            아래 버튼으로 초대를 수락하면 기업 요금제의 기능을 바로 이용할 수 있습니다.<br>
            초대는 <strong>${INVITE_TTL_DAYS}일</strong> 후 만료되며, 이 메일을 받은 주소로만 수락할 수 있습니다.
          </p>
          <div style="text-align:center;margin:24px 0">
            <a href="${acceptUrl}"
               style="display:inline-block;padding:14px 32px;background:#c8816b;color:#fff;text-decoration:none;border-radius:8px;font-size:14px;font-weight:bold">
              초대 수락하기
            </a>
          </div>
          <hr style="border:none;border-top:1px solid #eee;margin:24px 0">
          <p style="font-size:11px;color:#999;text-align:center;margin:0">
            본인이 요청하지 않은 초대라면 이 메일을 무시하셔도 됩니다.<br>
            링크를 다른 사람에게 전달하지 마세요.
          </p>
        </div>
      </div>
    `,
  });
  if (error) {
    console.error('[email] 기업 초대 발송 실패:', error);
    throw new Error(error.message || '이메일 발송 실패');
  }
}

/** 개인정보처리방침 정기 안내 (변경 없을 때 주기적 리마인더) */
export async function sendPrivacyAnnualReminderEmail(to: string, displayName: string) {
  const safeName = escapeHtml(displayName);
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'https://ninfle.kr';
  const { error } = await getResend().emails.send({
    from: FROM_EMAIL,
    to,
    subject: '[N인플] 개인정보처리방침 안내',
    html: `
      <div style="max-width:520px;margin:0 auto;font-family:'Apple SD Gothic Neo','Noto Sans KR',sans-serif;color:#333">
        <div style="background:#c8816b;padding:24px 20px;border-radius:12px 12px 0 0;text-align:center">
          <h1 style="color:#fff;font-size:20px;margin:0">N인플</h1>
        </div>
        <div style="padding:32px 24px;background:#fff;border:1px solid #eee;border-top:none;border-radius:0 0 12px 12px">
          <p style="font-size:16px;font-weight:bold;margin:0 0 16px">${safeName}님, 안녕하세요.</p>
          <p style="font-size:14px;line-height:1.7;color:#555;margin:0 0 24px">
            개인정보의 열람·정정·삭제·처리정지 요청 등 회원님의 권리와<br>
            개인정보 보호책임자 연락처는 개인정보처리방침에서 확인하실 수 있습니다.
          </p>
          <div style="text-align:center;margin:24px 0">
            <a href="${baseUrl}/privacy"
               style="display:inline-block;padding:14px 32px;background:#c8816b;color:#fff;text-decoration:none;border-radius:8px;font-size:14px;font-weight:bold">
              개인정보처리방침 보기
            </a>
          </div>
          <hr style="border:none;border-top:1px solid #eee;margin:24px 0">
          <p style="font-size:11px;color:#999;text-align:center;margin:0">
            본 메일은 정기 안내입니다. 수신 설정은<br>
            <a href="${baseUrl}/profile#notification-settings" style="color:#c8816b">마이페이지 · 알림 설정</a>에서 변경할 수 있습니다.
          </p>
        </div>
      </div>
    `,
  });
  if (error) {
    console.error('[email] 개인정보 정기 안내 발송 실패:', error);
    throw new Error(error.message || '이메일 발송 실패');
  }
}
