/**
 * 카드 프리미티브 공통 베이스 클래스(표면·모서리·테두리·그림자).
 * DashboardCard / GlassCard / AnimatedStatCard 가 각자 인라인으로 중복하던 동일 베이스를 한 곳으로 모은다.
 *
 * ⚠️ 이 세 컴포넌트는 패딩 체계(DashboardCard md=p-5 vs GlassCard md=p-6)와 기능(헤더/hover/애니메이션)이
 *    서로 달라 "하나의 컴포넌트로 병합"하면 24개 사용처에 시각 회귀가 난다. 그래서 병합하지 않고
 *    베이스 클래스만 공유한다(렌더 출력 불변).
 */
export const CARD_BASE_CLASS = 'bg-surface rounded-lg border border-border shadow-xs';
