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
  | 'ai_seo_diagnose'    // 미색인 SEO 진단 (Haiku)
  | 'ai_dashboard_opus'  // AI 대시보드 대화 (결제자 Opus, 고비용)
  | 'ai_consultant'      // AI 컨설턴트 (구독만 — 크레딧 미차감, 무료 5회/일 정책 유지)
  | 'bulk_search_volume' // 대량 검색량 조회 (≤100, 네이버 검색광고 API)
  | 'bulk_top3'          // 대량 TOP3 순위 조회 (≤50, 네이버 API)
  | 'bulk_index_register'; // 대량 구글 색인등록 (≤300, GSC API)

/** 기능별 차감 크레딧 (초안). 0 = 크레딧 미차감(구독 권한만으로 이용). */
export const CREDIT_COSTS: Record<CreditFeature, number> = {
  ai_titles: 5,
  ai_content_angles: 5,
  ai_body: 20,
  ai_rewrite: 10,
  ai_blog_analyze: 10,
  ai_youtube_analyze: 15,
  ai_seo_diagnose: 5,
  ai_dashboard_opus: 30,
  ai_consultant: 0,
  bulk_search_volume: 50,
  bulk_top3: 30,
  bulk_index_register: 50,
};

/** 사용자에게 보여줄 기능 한글명 (거래내역/부족 안내용) */
export const CREDIT_FEATURE_LABELS: Record<CreditFeature, string> = {
  ai_titles: '제목 생성',
  ai_content_angles: '글감 찾기',
  ai_body: 'AI 본문 생성',
  ai_rewrite: 'AI 교정·교열·윤문',
  ai_blog_analyze: '블로그 AI 분석',
  ai_youtube_analyze: '유튜브 콘텐츠 분석',
  ai_seo_diagnose: 'SEO 미색인 진단',
  ai_dashboard_opus: 'AI 대시보드 대화',
  ai_consultant: 'AI 컨설턴트',
  bulk_search_volume: '대량 검색량 조회',
  bulk_top3: '대량 TOP3 순위 조회',
  bulk_index_register: '대량 색인 등록',
};

/** 크레딧 충전 상품 (초안). 가격은 원(KRW). 크레딧당 약 9~11원. */
export interface CreditPackage {
  key: string;
  credits: number;
  amount: number; // 원
  name: string;
}
export const CREDIT_PACKAGES: CreditPackage[] = [
  { key: 'CREDIT_100',  credits: 100,  amount: 1100,  name: '크레딧 100' },
  { key: 'CREDIT_500',  credits: 500,  amount: 5000,  name: '크레딧 500' },
  { key: 'CREDIT_1000', credits: 1000, amount: 9500,  name: '크레딧 1,000' },
  { key: 'CREDIT_3000', credits: 3000, amount: 27000, name: '크레딧 3,000' },
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
  blogger: 500,
  influencer: 1500,
};

/** 신규 가입 1회성 무료 체험 크레딧 (초안). */
export const SIGNUP_BONUS_CREDITS = 100;
