import { MARKETING_SCHOOL_URL } from '@/lib/external-links';

/**
 * MarketingSchoolCard — 네이버 비즈니스 스쿨(공식 외부 교육 플랫폼) 안내 카드.
 *
 * N인플은 자체 강의 콘텐츠·강의 DB를 만들지 않는다. 마케팅 학습이 필요한 사용자는
 * 항상 이 카드를 통해 네이버 비즈니스 스쿨 공식 사이트로만 연결한다.
 * - 로그인/구독 여부와 무관하게 노출 가능, 크레딧·포인트 차감 없음.
 * - 링크는 MARKETING_SCHOOL_URL 한 곳에서만 관리 (src/lib/external-links.ts).
 */
export default function MarketingSchoolCard() {
  return (
    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-surface border border-border rounded-xl p-4">
      <div className="min-w-0 space-y-1">
        <p className="text-sm font-bold text-text">마케팅 강의가 필요하신가요?</p>
        <p className="text-xs text-dim leading-relaxed">
          네이버 비즈니스 스쿨에서 마케팅, 쇼핑, 광고, 콘텐츠 등 실무에 필요한 다양한 교육 콘텐츠를 확인해보세요.
        </p>
      </div>
      <a
        href={MARKETING_SCHOOL_URL}
        target="_blank"
        rel="noopener noreferrer"
        aria-label="네이버 비즈니스 스쿨 바로가기"
        className="shrink-0 inline-flex items-center gap-1 px-4 py-2 rounded-lg text-xs font-bold bg-accent text-white hover:bg-accent-hover transition-colors"
      >
        네이버 비즈니스 스쿨 바로가기
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M7 17L17 7" />
          <path d="M7 7h10v10" />
        </svg>
      </a>
    </div>
  );
}
