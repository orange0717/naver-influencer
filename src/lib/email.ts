import { Resend } from 'resend';

let _resend: Resend | null = null;
function getResend() {
  if (!_resend) {
    _resend = new Resend(process.env.RESEND_API_KEY);
  }
  return _resend;
}

const FROM_EMAIL = process.env.RESEND_FROM_EMAIL || 'N인플 <noreply@ninfl.co.kr>';

/** 데모 인증번호 이메일 */
export async function sendDemoVerificationEmail(to: string, code: string) {
  return getResend().emails.send({
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
            아래 인증번호를 입력하면 7일간 무료 데모 체험이 시작됩니다.
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
}

/** 데모 만료 알림 이메일 */
export async function sendDemoExpiredEmail(to: string, displayName: string) {
  return getResend().emails.send({
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
            <a href="https://ninfl.co.kr/auth/signup"
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
}

/** 데모 만료 3일 전 리마인더 이메일 */
export async function sendDemoReminderEmail(to: string, displayName: string, daysLeft: number) {
  return getResend().emails.send({
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
            <a href="https://ninfl.co.kr/auth/signup"
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
}
