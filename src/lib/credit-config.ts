/**
 * credit-config.ts — N인플 크레딧(사용량) 시스템 설정 (Single Source of Truth)
 *
 * 구독제와 병행하는 하이브리드 과금 구조에서, 크레딧은 AI/외부API 등
 * 고비용 기능의 "사용량"을 관리한다. 아래 값은 정책 상수이므로 코드에
 * 하드코딩하지 말고 반드시 이 파일을 참조한다. (초안 값 — 조정 시 여기만 수정)
 */

/** 크레딧을 차감하는 고비용 기능 키. 일반 조회/화면이동은 여기에 없다(크레딧 미사용). */
export type CreditFeature =
  | 'ai_titles'          // 제목 생성 (Haiku)
  | 'ai_content_angles'  // 글감 찾기 (Haiku)
  | 'ai_body'            // 본문 생성 (Haiku, 최대 토큰)
  | 'ai_rewrite'         // 교정·교열·윤문 (Haiku)
  | 'ai_blog_analyze'    // 블로그 글 AI 감지 (Haiku)
  | 'ai_youtube_analyze' // 유튜브 콘텐츠 분석 (Haiku)
  | 'ai_shortform_analyze' // 릴스/쇼츠 분석 (Manus 영상열람 — 최고원가)
  | 'ai_seo_diagnose'    // 미색인 SEO 진단 (Haiku)
  | 'ai_dashboard_opus'  // AI 대시보드 대화 (결제자 Opus, 고비용)
  | 'ai_consultant'      // AI 컨설턴트 (구독만 — 크레딧 미차감, 무료 5회/일 정책 유지)
  | 'bulk_search_volume' // 대량 검색량 조회 (≤100, 네이버 검색광고 API)
  | 'bulk_top3'          // 대량 TOP3 순위 조회 (≤50, 네이버 API)
  | 'bulk_index_register' // 대량 구글 색인등록 (≤300, GSC API)
  | 'bulk_exposure_check'; // 노출 현황 30일 이전 확장 조회 (초과 1개당 과금 — amountOverride 로 개수×단가)

/**
 * 기능별 차감 크레딧. 0 = 크레딧 미차감(구독 권한만으로 이용).
 * 스케일 기준: 콜당 원가에 비례한 1~8 단위(2026-08-13 요금제 재정합).
 * 크레딧 소매가 ~10원/개이므로 (차감크레딧 × 10원) ≥ 콜당 AI원가 를 만족한다.
 * 예: 제목 2크레딧(≈20원) vs 원가 7원, 심층피드백 7크레딧 vs 22원.
 */
export const CREDIT_COSTS: Record<CreditFeature, number> = {
  ai_titles: 2,          // 제목 생성 — 원가 ~7원
  ai_content_angles: 4,  // 글감 찾기 — ~13원
  ai_body: 8,            // 본문 생성 — 최대 토큰, 최고가
  ai_rewrite: 4,         // 맞춤법 보정 — ~12원
  ai_blog_analyze: 7,    // 글 심층 피드백 — ~22원
  ai_youtube_analyze: 8, // 유튜브 숏츠 분석 — ~25원
  ai_shortform_analyze: 250, // 릴스/쇼츠 — Manus 영상열람 ~2,000원, 고단가(≈원가 커버+마진)
  ai_seo_diagnose: 4,    // 미노출/SEO 진단 — ~11원
  ai_dashboard_opus: 6,  // AI 브리핑(Opus) — ~18원
  ai_consultant: 0,      // AI 상담 — 무료(하루 3회 정책)
  bulk_search_volume: 8, // 대량 검색량(≤100건 배치)
  bulk_top3: 5,          // 대량 TOP3(≤50건 배치)
  bulk_index_register: 8,// 대량 색인등록(≤300건 배치)
  bulk_exposure_check: 1,// 노출 현황 확장 조회 — 무료 90개 초과분 "1개당" 단가(amountOverride=초과개수×이 값)
};

/** 사용자에게 보여줄 기능 한글명 (거래내역/부족 안내용) */
export const CREDIT_FEATURE_LABELS: Record<CreditFeature, string> = {
  ai_titles: '제목 생성',
  ai_content_angles: '글감 찾기',
  ai_body: 'AI 본문 생성',
  ai_rewrite: 'AI 교정·교열·윤문',
  ai_blog_analyze: '블로그 AI 분석',
  ai_youtube_analyze: '유튜브 콘텐츠 분석',
  ai_shortform_analyze: '릴스·쇼츠 분석',
  ai_seo_diagnose: 'SEO 미색인 진단',
  ai_dashboard_opus: 'AI 대시보드 대화',
  ai_consultant: 'AI 컨설턴트',
  bulk_search_volume: '대량 검색량 조회',
  bulk_top3: '대량 TOP3 순위 조회',
  bulk_index_register: '대량 색인 등록',
  bulk_exposure_check: '노출 현황 확장 조회',
};

/** 크레딧 충전 상품 (초안). 가격은 원(KRW). 크레딧당 약 9~11원. */
export interface CreditPackage {
  key: string;
  credits: number;
  amount: number; // 원
  name: string;
}
export const CREDIT_PACKAGES: CreditPackage[] = [
  { key: 'CREDIT_100',  credits: 100,  amount: 1000,  name: '크레딧 100' },   // 10.0원/개
  { key: 'CREDIT_500',  credits: 500,  amount: 4500,  name: '크레딧 500' },   // 9.0원/개
  { key: 'CREDIT_1000', credits: 1000, amount: 8500,  name: '크레딧 1,000' }, // 8.5원/개
  { key: 'CREDIT_3000', credits: 3000, amount: 24000, name: '크레딧 3,000' }, // 8.0원/개
];

export function getCreditPackage(key: string): CreditPackage | null {
  return CREDIT_PACKAGES.find((p) => p.key === key) || null;
}

/**
 * 구독 플랜별 월 지급 크레딧 (초안).
 * billing.ts 결제/갱신 성공 시 payment_id 기준 멱등 지급.
 * plan tier 는 payment-config.ts PlanDef.tier ('blogger' | 'influencer') 기준.
 */
export const PLAN_MONTHLY_CREDITS: Record<string, number> = {
  blogger: 400,     // 5,500 플랜: 풀사용 시 소모 ≈390 (여유)
  influencer: 800,  // 9,900 플랜: 풀사용 시 소모 ≈1,060 → 헤비유저는 추가충전 유도
};

/**
 * 신규 가입 1회성 무료 체험 크레딧. 무료 상시 이용은 하루 3회 quota(free-quota.ts)로
 * 별도 처리되므로, 이 보너스는 "유료 기능 맛보기"용 소액. (조정 가능 · 켜기 전 확정)
 */
export const SIGNUP_BONUS_CREDITS = 20;
