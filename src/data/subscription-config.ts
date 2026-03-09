import { SubscriptionPlan } from '@/lib/types';

/* ── 구독 플랜 (월 9,900원) ── */
export const subscriptionPlan: SubscriptionPlan = {
  id: 'plan-monthly',
  name: '월간 구독',
  price_krw: 9900,
  period_days: 30,
  description: '모든 키워드 데이터 무제한 열람',
  features: [
    '키워드 상세 분석 무제한',
    '인플루언서 순위 전체 열람',
    '검색량 트렌드 분석',
    '일일 추천 키워드 전체',
    '내 대시보드 + 경쟁자 비교',
    '실시간 데이터 업데이트',
  ],
};

/* ── 무료 사용자에게 열리는 기능 ── */
export const FREE_FEATURES = [
  '키워드 목록 열람',
  '일일 추천 키워드 3개',
  '참여자 수 확인',
] as const;

/* ── 구독 전용 기능 ── */
export const LOCKED_FEATURES = [
  '키워드 상세 (검색량, 트렌드)',
  '인플루언서 순위 전체',
  '인플루언서 프로필 상세',
  '검색량 히스토리',
  '내 대시보드 전체 기능',
] as const;
