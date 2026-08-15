import { useNotificationSettings } from '@/hooks/useNotifications';

export interface UserProfile {
  id: string;
  email: string;
  nickname: string;
  point_balance: number;
  total_charged: number;
  total_used: number;
  linked_influencer_id: string | null;
  blog_id: string | null;
  subscription_plan: string | null;
  subscription_expires_at: string | null;
  created_at: string;
}

export interface LinkedInfluencer {
  display_name: string;
  naver_id: string;
}

export interface Transaction {
  amount: number;
  tx_type: string;
  description: string;
  created_at: string;
}

function ToggleRow({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="flex items-center justify-between py-1.5">
      <span className="text-sm text-text">{label}</span>
      <button
        onClick={() => onChange(!checked)}
        className={`relative w-11 h-6 rounded-full transition-colors cursor-pointer ${checked ? 'bg-accent' : 'bg-border'}`}
        role="switch"
        aria-checked={checked}
      >
        <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${checked ? 'translate-x-5' : ''}`} />
      </button>
    </div>
  );
}

export function NotificationSettingsSection() {
  const { settings, isLoading, updateSettings } = useNotificationSettings();

  if (isLoading || !settings) return null;

  const handleChange = (key: string, value: boolean) => {
    updateSettings({ [key]: value });
  };

  return (
    <div id="notification-settings" className="bg-surface rounded-lg border border-border p-5">
      <h3 className="font-bold text-sm mb-3">알림 설정</h3>
      <div className="space-y-2">
        <p className="text-xs text-dim mb-2">알림 채널</p>
        <ToggleRow label="이메일 알림" checked={settings.email_enabled} onChange={(v) => handleChange('email_enabled', v)} />
        <ToggleRow label="카카오 알림톡" checked={settings.kakao_enabled} onChange={(v) => handleChange('kakao_enabled', v)} />
        <ToggleRow label="인앱 알림" checked={settings.in_app_enabled} onChange={(v) => handleChange('in_app_enabled', v)} />
        <ToggleRow
          label="개인정보처리방침 안내 메일"
          checked={settings.privacy_notice_email !== false}
          onChange={(v) => handleChange('privacy_notice_email', v)}
        />
        <p className="text-[11px] text-dim pl-0.5 -mt-1 mb-1">처리방침 개정·연 1회 정기 안내(설정된 주기)입니다. 순위 알림과 별도입니다.</p>

        <hr className="border-border my-2" />

        <p className="text-xs text-dim mb-2">알림 유형</p>
        <ToggleRow label="TOP3 진입 알림" checked={settings.notify_top3_entry} onChange={(v) => handleChange('notify_top3_entry', v)} />
        <ToggleRow label="TOP3 이탈 알림" checked={settings.notify_top3_exit} onChange={(v) => handleChange('notify_top3_exit', v)} />
        <ToggleRow label="순위 큰 변동 알림 (3단계 이상)" checked={settings.notify_significant_change} onChange={(v) => handleChange('notify_significant_change', v)} />
      </div>
    </div>
  );
}

/** SNS 입력 필드 */
export function SnsInput({ label, icon, value, onChange, placeholder }: {
  label: string; icon: string; value: string; onChange: (v: string) => void; placeholder: string;
}) {
  return (
    <div className="flex items-center gap-3">
      <span className="w-8 text-center text-base shrink-0">{icon}</span>
      <div className="flex-1">
        <label className="text-xs text-dim font-semibold block mb-1">{label}</label>
        <input
          type="text"
          value={value}
          onChange={e => onChange(e.target.value)}
          placeholder={placeholder}
          maxLength={200}
          className="w-full px-3 py-2 bg-bg border border-border rounded-lg text-sm text-text placeholder:text-dim focus:outline-none focus:border-accent transition-colors"
        />
      </div>
    </div>
  );
}
