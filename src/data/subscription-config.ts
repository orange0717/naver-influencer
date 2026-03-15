import { SubscriptionPlan } from '@/lib/types';

/* ── 이용권 플랜 ── */
export const subscriptionPlan: SubscriptionPlan = {
  id: 'plan-personal',
  name: '개인 이용권',
  price_krw: 9900,
  period_days: 30,
  description: '플랜을 선택하고 결제하세요',
  features: [
    '키워드 상세 분석',
    '검색량 트렌드 차트',
    '기본 대시보드',
    '일일 추천 키워드',
    '블로그 등급 위젯',
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
