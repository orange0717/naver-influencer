/**
 * banner-data.ts — 배너 콘텐츠 중앙 관리
 *
 * type:
 *   promo     — 자사 서비스 홍보 (OrangeRefine, OrangeConnect 등)
 *   subscribe — 비구독자 구독 유도 CTA
 *   partner   — 협력사 (블로그 관련 도구) 소개
 */

export interface BannerItem {
  id: string;
  type: 'promo' | 'subscribe' | 'partner';
  title: string;
  description: string;
  cta: string;
  href: string;
  /** 외부 링크 여부 */
  external?: boolean;
  /** 배경 그라데이션 (Tailwind) */
  gradient?: string;
  /** 아이콘 이모지 */
  icon?: string;
  /** 라벨 뱃지 */
  badge?: string;
}

/* ── 자사 서비스 홍보 배너 ── */
export const PROMO_BANNERS: BannerItem[] = [
  {
    id: 'orangerefine',
    type: 'promo',
    title: '블로그 글, AI로 한 번에 교정하세요',
    description: '맞춤법 · 교정 · 교열 · 윤문까지 3단계 AI 검수. 가입 시 10,000文 무료 지급.',
    cta: '무료로 체험하기 →',
    href: 'https://orangerefine.kr',
    external: true,
    gradient: 'from-[#FDF6F3] to-[#F5E6E0]',
    icon: '✍️',
    badge: 'OrangeRefine',
  },
  {
    id: 'orangeconnect',
    type: 'promo',
    title: '광고주와 인플루언서를 연결합니다',
    description: '체험단, 협찬, 원고 의뢰까지. 인플루언서와 광고주를 위한 매칭 플랫폼.',
    cta: '사전 등록하기 →',
    href: '/subscribe',
    external: false,
    gradient: 'from-[#F0F4FF] to-[#E8EEFF]',
    icon: '🤝',
    badge: 'OrangeConnect · 준비 중',
  },
];

/* ── 구독 유도 배너 ── */
export const SUBSCRIBE_BANNERS: BannerItem[] = [
  {
    id: 'subscribe-main',
    type: 'subscribe',
    title: '실시간 순위 추적으로 성장하세요',
    description: '키워드 순위 모니터링, 경쟁자 분석, 상세 리포트까지. 데이터로 인플루언서 전략을 세우세요.',
    cta: 'PRO 구독 시작 · 월 9,900원 →',
    href: '/subscribe',
    gradient: 'from-[#FFF7F5] to-[#FFE8E0]',
    icon: '🚀',
    badge: 'PRO',
  },
  {
    id: 'subscribe-dashboard',
    type: 'subscribe',
    title: '대시보드의 모든 데이터를 확인하세요',
    description: 'TOP 키워드, 순위 변동, 경쟁자 비교까지. PRO 구독으로 블러 없이 전체 데이터를 이용하세요.',
    cta: '구독하고 전체 보기 →',
    href: '/subscribe',
    gradient: 'from-[#FFF7F5] to-[#FFE8E0]',
    icon: '📊',
    badge: 'PRO',
  },
];

/* ── 협력사 배너 (블로그 관련 도구) ── */
export const PARTNER_BANNERS: BannerItem[] = [
  {
    id: 'partner-tools',
    type: 'partner',
    title: '블로거를 위한 추천 도구 모음',
    description: '블로그 운영에 도움이 되는 도구들을 직접 사용해보고 소개합니다. AI 교정, SEO 분석 등.',
    cta: '추천 도구 보기 →',
    href: '/tools',
    external: false,
    gradient: 'from-[#F0F9F4] to-[#E8F5E9]',
    icon: '🔧',
    badge: '추천 도구',
  },
];

/** 배너 ID로 특정 배너 가져오기 */
export function getBanner(id: string): BannerItem | undefined {
  return [...PROMO_BANNERS, ...SUBSCRIBE_BANNERS, ...PARTNER_BANNERS].find(b => b.id === id);
}
