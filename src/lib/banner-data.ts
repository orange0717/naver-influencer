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
    id: 'orangelibrary',
    type: 'promo',
    title: '블로그 글, AI로 한 번에 교정하세요',
    description: '맞춤법 · 교정 · 교열 · 윤문까지 3단계 AI 검수. 가입 시 10,000文 무료 지급.',
    cta: '무료로 체험하기 →',
    href: 'https://orangelibrary.co.kr',
    external: true,
    gradient: 'from-[#FDF6F3] to-[#F5E6E0]',
    badge: '오렌지도서관',
  },
  {
    id: 'orangeconnect',
    type: 'promo',
    title: '광고주와 인플루언서를 연결합니다',
    description: '체험단, 협찬, 원고 의뢰까지. 인플루언서와 광고주를 위한 매칭 플랫폼.',
    cta: '사전 등록하기 →',
    href: '/guide',
    external: false,
    gradient: 'from-[#F0F4FF] to-[#E8EEFF]',
    badge: 'OrangeConnect · 준비 중',
  },
];

/* ── 이용권 유도 배너 (비활성) ── */
export const SUBSCRIBE_BANNERS: BannerItem[] = [];

/* ── 협력사 배너 (블로그 관련 도구) ── */
export const PARTNER_BANNERS: BannerItem[] = [];

/** 배너 ID로 특정 배너 가져오기 */
export function getBanner(id: string): BannerItem | undefined {
  return [...PROMO_BANNERS, ...SUBSCRIBE_BANNERS, ...PARTNER_BANNERS].find(b => b.id === id);
}
