import { SubscriptionPlan } from '@/lib/types';

/* ── 이용권 플랜 ── */
export const subscriptionPlan: SubscriptionPlan = {
  id: 'plan-personal',
  name: '개인 이용권',
  price_krw: 19800,
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
  '키워드 목록 검색',
  '인플루언서 목록 검색',
  '커뮤니티 이용',
  '키워드 상세 정보 (참여자, 경쟁도)',
  '인플루언서 순위 전체',
  '인플루언서 프로필 상세',
  '검색량 조회',
] as const;

/* ── PRO 전용 기능 (대시보드) ── */
export const LOCKED_FEATURES = [
  '내 키워드 순위 실시간 추적',
  '스마트 알림 (하락 위험 / TOP3 기회)',
  '경쟁자 비교 분석',
  '순위 추이 차트',
  '맞춤 추천 키워드',
] as const;
