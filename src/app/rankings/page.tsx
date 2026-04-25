export const metadata = {
  title: '랭킹 — N인플',
  description: '네이버 블로그 순위 · 인플루언서 순위 · 블로그 품질지수 종합 허브',
};

const ITEMS = [
  {
    href: '/rankings/blogger',
    title: '블로그 순위',
    desc: '네이버 블로그 활동 점수 기반 종합 순위 Top 50 + 내 블로그 순위 조회',
    badge: '개발 중',
  },
  {
    href: '/rankings/influencer',
    title: '인플루언서 순위',
    desc: 'N인플 자체 순위 — 키워드 참여·상위노출·월간 검색량 기반 Top 50',
    badge: '개발 중',
  },
  {
    href: '/blog-quality',
    title: '블로그 품질지수',
    desc: '블로그 ID 입력으로 C-rank · D.I.A. · D.I.A.+ 종합 추정 점수 확인',
    badge: '개발 중',
  },
];

export default function RankingsHubPage() {
  return (
    <div className="max-w-3xl mx-auto px-4 py-8 space-y-6">
      <div>
        <h1 className="text-2xl font-extrabold">랭킹</h1>
        <p className="text-sm text-dim mt-1">
          네이버 블로그·인플루언서 순위와 블로그 품질지수를 한 곳에서 확인하세요.
        </p>
      </div>

      <div className="grid gap-3">
        {ITEMS.map((it) => (
          <a
            key={it.href}
            href={it.href}
            className="group block bg-surface rounded-xl border border-border p-5 hover:border-accent/50 transition"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <h2 className="text-base font-extrabold">{it.title}</h2>
                  <span className="text-[10px] font-bold text-accent bg-accent/10 px-2 py-0.5 rounded-full">
                    {it.badge}
                  </span>
                </div>
                <p className="text-xs text-dim leading-relaxed">{it.desc}</p>
              </div>
              <span className="text-dim group-hover:text-accent transition text-lg shrink-0">→</span>
            </div>
          </a>
        ))}
      </div>

      <p className="text-[11px] text-dim text-center">
        수집·점수 산정 방식은 <a href="/bot-info" className="underline">봇 정보</a>에서 확인하세요.
      </p>
    </div>
  );
}
