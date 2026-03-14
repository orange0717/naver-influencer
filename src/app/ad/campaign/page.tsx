import Link from 'next/link';

export default function CampaignPage() {
  return (
    <div className="max-w-2xl mx-auto py-12 px-4 text-center">
      <div className="bg-surface border border-border rounded-2xl p-10">
        <div className="w-16 h-16 mx-auto rounded-2xl bg-blue-500/10 flex items-center justify-center mb-5">
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-blue-500">
            <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/>
            <circle cx="9" cy="7" r="4"/>
            <path d="M22 21v-2a4 4 0 0 0-3-3.87"/>
            <path d="M16 3.13a4 4 0 0 1 0 7.75"/>
          </svg>
        </div>

        <div className="inline-flex items-center gap-2 px-3 py-1 bg-blue-500/10 rounded-full mb-4">
          <span className="text-blue-500 text-xs font-bold">COMING SOON</span>
        </div>

        <h1 className="text-2xl font-black mb-3">캠페인 등록</h1>
        <p className="text-dim leading-relaxed mb-6">
          체험단·리뷰 캠페인을 등록하면<br />
          N인플의 블로거·인플루언서들에게 자동으로 노출됩니다.
        </p>

        <div className="bg-bg rounded-xl p-5 mb-6 text-left">
          <h3 className="font-bold text-sm mb-3">준비 중인 기능</h3>
          <ul className="space-y-2 text-sm text-dim">
            <li className="flex items-start gap-2">
              <span className="text-blue-500 mt-0.5">✦</span>
              <span>카테고리·지역별 블로거/인플루언서 자동 매칭</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-blue-500 mt-0.5">✦</span>
              <span>캠페인 성과 실시간 추적 (순위 변동, 조회수)</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-blue-500 mt-0.5">✦</span>
              <span>합리적인 가격 — 소상공인도 부담 없이</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-blue-500 mt-0.5">✦</span>
              <span>리뷰 품질 보장 — 실제 순위 데이터 기반 선별</span>
            </li>
          </ul>
        </div>

        <p className="text-sm text-dim mb-4">오픈 알림을 받고 싶으시면 문의해주세요</p>
        <a href="mailto:orange@orangelibrary.co.kr"
          className="inline-block px-6 py-3 bg-blue-500 text-white font-bold rounded-xl hover:bg-blue-600 transition text-sm">
          오픈 알림 신청
        </a>
        <div className="mt-6">
          <Link href="/ad" className="text-sm text-accent hover:underline">
            ← 광고센터로 돌아가기
          </Link>
        </div>
      </div>
    </div>
  );
}
