import ColorPaletteClient from './ColorPaletteClient';

export const metadata = {
  title: '컬러 팔레트 — N인플',
  description: '블로그 썸네일 이미지에서 대표 색상을 추출하고, 색상 조합·카테고리별 팔레트를 만들어보세요',
};

// 브라우저 canvas 기반 색상 추출만 사용 — 서버 호출/AI 비용이 없어 로그인·구독 없이 공개 제공
export default function ColorPalettePage() {
  return <ColorPaletteClient />;
}
