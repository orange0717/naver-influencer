import Link from 'next/link';

interface NoticeItem {
  id: string;
  title: string;
  tag: string;
  is_pinned: boolean;
  created_at: string;
}

interface WelcomeDashboardProps {
  displayName: string;
  email: string | null;
  joinedAt: string | null;
  subscriptionPlan: string | null;
  subscriptionExpiresAt: string | null;
  trialStartedAt: number | null;
  savedKeywordCount: number;
  recentNotices: NoticeItem[];
}

const TAG_LABEL: Record<string, string> = {
  notice: '공지',
  update: '업데이트',
  event: '이벤트',
};

const TAG_COLOR: Record<string, string> = {
  notice: 'bg-accent/15 text-accent',
  update: 'bg-[#c8816b]/15 text-[#c8816b]',
  event: 'bg-[#F29C68]/15 text-[#F29C68]',
};

function formatShortDate(dateStr: string) {
  const d = new Date(dateStr);
  return `${d.getMonth() + 1}.${d.getDate().toString().padStart(2, '0')}`;
}

function planBadge(plan: string | null, expiresAt: string | null) {
  if (!plan) return { label: '체험/무료', tone: 'bg-dim/15 text-dim' };
  const active = expiresAt && new Date(expiresAt).getTime() > Date.now();
  if (!active) return { label: '체험/무료', tone: 'bg-dim/15 text-dim' };
  const upper = plan.toUpperCase();
  if (upper.includes('AGENCY')) return { label: '대행사', tone: 'bg-[#D4A017]/20 text-[#9c7811]' };
  if (upper.includes('INFLUENCER')) return { label: '인플루언서', tone: 'bg-accent/20 text-accent' };
  if (upper.includes('PERSONAL') || upper.includes('PERSONAL')) return { label: '개인', tone: 'bg-[#D9ABA0]/30 text-[#a0635a]' };
  return { label: plan, tone: 'bg-accent/20 text-accent' };
}

function trialDaysLeft(trialStartedAt: number | null): number | null {
  if (!trialStartedAt) return null;
  const TRIAL_MS = 3 * 24 * 60 * 60 * 1000;
  const elapsed = Date.now() - trialStartedAt;
  const remain = Math.ceil((TRIAL_MS - elapsed) / (24 * 60 * 60 * 1000));
  return remain > 0 ? remain : 0;
}

function joinedDays(joinedAt: string | null): number | null {
  if (!joinedAt) return null;
  const d = new Date(joinedAt).getTime();
  if (Number.isNaN(d)) return null;
  return Math.floor((Date.now() - d) / (24 * 60 * 60 * 1000));
}

export default function WelcomeDashboard({
  displayName,
  email,
  joinedAt,
  subscriptionPlan,
  subscriptionExpiresAt,
  trialStartedAt,
  savedKeywordCount,
  recentNotices,
}: WelcomeDashboardProps) {
  const badge = planBadge(subscriptionPlan, subscriptionExpiresAt);
  const trialDays = trialDaysLeft(trialStartedAt);
  const days = joinedDays(joinedAt);

  return (
    <div className="space-y-6">
      {/* 환영 헤더 */}
      <div className="bg-surface border border-border rounded-2xl px-6 py-6 flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold flex items-center gap-2 flex-wrap">
            <span>{displayName} 님 환영합니다!</span>
            <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${badge.tone}`}>{badge.label}</span>
          </h1>
          {email && <p className="text-xs text-dim mt-1">{email}</p>}
        </div>
        <Link
          href="/profile"
          className="px-4 py-2 rounded-lg bg-accent text-white text-sm font-semibold hover:bg-accent-hover transition-colors"
        >
          인플루언서 연결하기
        </Link>
      </div>

      {/* 통계 카드 3개 */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="bg-surface border border-border rounded-2xl px-5 py-5">
          <div className="text-xs text-dim mb-2">저장 키워드</div>
          <div className="flex items-baseline gap-1">
            <span className="text-3xl font-bold text-text font-rank">{savedKeywordCount}</span>
            <span className="text-sm text-dim">개</span>
          </div>
          <Link href="/my/saved-keywords" className="text-xs text-accent hover:underline mt-2 inline-block">
            저장 키워드 보기 →
          </Link>
        </div>

        <div className="bg-surface border border-border rounded-2xl px-5 py-5">
          <div className="text-xs text-dim mb-2">{trialDays !== null ? '무료 체험' : '내 등급'}</div>
          {trialDays !== null ? (
            <div className="flex items-baseline gap-1">
              <span className="text-3xl font-bold text-accent font-rank">D-{trialDays}</span>
            </div>
          ) : (
            <div className="text-2xl font-bold text-text">{badge.label}</div>
          )}
          <Link href="/subscribe" className="text-xs text-accent hover:underline mt-2 inline-block">
            요금제 보기 →
          </Link>
        </div>

        <div className="bg-surface border border-border rounded-2xl px-5 py-5">
          <div className="text-xs text-dim mb-2">함께한 시간</div>
          <div className="flex items-baseline gap-1">
            <span className="text-3xl font-bold text-text font-rank">{days ?? 0}</span>
            <span className="text-sm text-dim">일째</span>
          </div>
          {joinedAt && (
            <p className="text-xs text-dim mt-2">{formatShortDate(joinedAt)} 가입</p>
          )}
        </div>
      </div>

      {/* 빠른 시작 */}
      <div className="bg-surface border border-border rounded-2xl px-6 py-5">
        <h2 className="text-sm font-bold mb-4">빠른 시작</h2>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <QuickAction
            href="/profile"
            title="인플루언서 연결"
            desc="네이버 ID 입력"
            color="bg-accent/10 text-accent"
            icon={<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 11l-3-3m0 0l-3 3m3-3v8"/></svg>}
          />
          <QuickAction
            href="/keywords"
            title="키워드 검색"
            desc="블루오션 발굴"
            color="bg-[#D9ABA0]/20 text-[#a0635a]"
            icon={<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/></svg>}
          />
          <QuickAction
            href="/influencers"
            title="인플루언서 리스트"
            desc="경쟁자 분석"
            color="bg-[#F29C68]/15 text-[#c4753a]"
            icon={<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/></svg>}
          />
          <QuickAction
            href="/tools"
            title="도구"
            desc="AI 글쓰기·분석"
            color="bg-[#D4A017]/20 text-[#9c7811]"
            icon={<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/></svg>}
          />
        </div>
      </div>

      {/* 공지사항 */}
      <div className="bg-surface border border-border rounded-2xl px-6 py-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-bold">공지사항</h2>
          <Link href="/notice" className="text-xs text-dim hover:text-accent">더보기</Link>
        </div>
        {recentNotices.length === 0 ? (
          <p className="text-sm text-dim py-6 text-center">아직 공지사항이 없습니다.</p>
        ) : (
          <ul className="space-y-2">
            {recentNotices.map((n) => (
              <li key={n.id}>
                <Link
                  href={`/notice/${n.id}`}
                  className="flex items-center gap-3 py-2 text-sm hover:text-accent transition-colors"
                >
                  {n.is_pinned && (
                    <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-accent/15 text-accent flex-shrink-0">고정</span>
                  )}
                  <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded flex-shrink-0 ${TAG_COLOR[n.tag] || 'bg-dim/15 text-dim'}`}>
                    {TAG_LABEL[n.tag] || n.tag}
                  </span>
                  <span className="flex-1 truncate">{n.title}</span>
                  <span className="text-xs text-dim flex-shrink-0">{formatShortDate(n.created_at)}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function QuickAction({ href, title, desc, color, icon }: { href: string; title: string; desc: string; color: string; icon: React.ReactNode }) {
  return (
    <Link
      href={href}
      className="flex flex-col gap-2 p-3 rounded-xl border border-border hover:border-accent/40 hover:bg-accent/5 transition-colors"
    >
      <div className={`w-9 h-9 rounded-lg flex items-center justify-center ${color}`}>{icon}</div>
      <div>
        <div className="text-sm font-bold text-text">{title}</div>
        <div className="text-xs text-dim mt-0.5">{desc}</div>
      </div>
    </Link>
  );
}
