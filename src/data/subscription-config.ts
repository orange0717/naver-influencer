import { SubscriptionPlan } from '@/lib/types';

/* ── 이용권 플랜 ── */
export const subscriptionPlan: SubscriptionPlan = {
  id: 'plan-monthly',
  name: '월간 이용권',
  price_krw: 9900,
  period_days: 30,
  description: '스마트스토어에서 이용권을 구매하고 코드를 등록하세요',
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
  '커뮤니티',
  '검색량 조회',
  '블로그 등급 위젯',
] as const;

/* ── 이용권 전용 기능 ── */
export const LOCKED_FEATURES = [
  '키워드 상세 (검색량, 트렌드)',
  '인플루언서 순위 전체',
  '인플루언서 프로필 상세',
  '내 대시보드 전체 기능',
  '경쟁자 비교 분석',
] as const;
