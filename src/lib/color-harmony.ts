/**
 * HEX/RGB/HSL 색상 변환 + 컬러 하모니(보색·유사색·단색 등) 생성 + 카테고리 프리셋 팔레트.
 * 전부 순수 함수 — DOM/canvas 의존 없이 서버·클라이언트 어디서나 동작한다.
 */

export interface HSL {
  h: number;
  s: number;
  l: number;
}

export function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const clean = hex.replace('#', '').trim();
  const full = clean.length === 3 ? clean.split('').map((c) => c + c).join('') : clean;
  const bigint = parseInt(full, 16) || 0;
  return { r: (bigint >> 16) & 255, g: (bigint >> 8) & 255, b: bigint & 255 };
}

export function rgbToHex(r: number, g: number, b: number): string {
  return (
    '#' +
    [r, g, b]
      .map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0'))
      .join('')
      .toUpperCase()
  );
}

export function rgbToHsl(r: number, g: number, b: number): HSL {
  r /= 255;
  g /= 255;
  b /= 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  const d = max - min;
  let h = 0;
  let s = 0;
  if (d !== 0) {
    s = d / (1 - Math.abs(2 * l - 1));
    switch (max) {
      case r:
        h = 60 * (((g - b) / d) % 6);
        break;
      case g:
        h = 60 * ((b - r) / d + 2);
        break;
      default:
        h = 60 * ((r - g) / d + 4);
    }
  }
  if (h < 0) h += 360;
  return { h, s: s * 100, l: l * 100 };
}

export function hslToRgb(h: number, s: number, l: number): { r: number; g: number; b: number } {
  const hh = ((h % 360) + 360) % 360;
  const ss = s / 100;
  const ll = l / 100;
  const c = (1 - Math.abs(2 * ll - 1)) * ss;
  const x = c * (1 - Math.abs(((hh / 60) % 2) - 1));
  const m = ll - c / 2;
  let r = 0, g = 0, b = 0;
  if (hh < 60) [r, g, b] = [c, x, 0];
  else if (hh < 120) [r, g, b] = [x, c, 0];
  else if (hh < 180) [r, g, b] = [0, c, x];
  else if (hh < 240) [r, g, b] = [0, x, c];
  else if (hh < 300) [r, g, b] = [x, 0, c];
  else [r, g, b] = [c, 0, x];
  return { r: (r + m) * 255, g: (g + m) * 255, b: (b + m) * 255 };
}

export function hexToHsl(hex: string): HSL {
  const { r, g, b } = hexToRgb(hex);
  return rgbToHsl(r, g, b);
}

export function hslToHex(h: number, s: number, l: number): string {
  const { r, g, b } = hslToRgb(h, s, l);
  return rgbToHex(r, g, b);
}

const HEX6 = /^#?[0-9a-fA-F]{6}$/;

/** 사용자가 입력한 HEX 문자열을 `#RRGGBB` 대문자로 정규화한다. 6자리가 아니면 null. */
export function normalizeHex(raw: string): string | null {
  const value = raw.trim();
  if (!HEX6.test(value)) return null;
  return '#' + value.replace('#', '').toUpperCase();
}

/** 배경색 위에 올렸을 때 읽히는 글자색(검정/흰색)을 YIQ 밝기로 고른다. */
export function readableTextColor(hex: string): string {
  const { r, g, b } = hexToRgb(hex);
  return (r * 299 + g * 587 + b * 114) / 1000 >= 140 ? '#1B1B1B' : '#FFFFFF';
}

export function formatRgb(hex: string): string {
  const { r, g, b } = hexToRgb(hex);
  return `rgb(${r}, ${g}, ${b})`;
}

export function formatHsl(hex: string): string {
  const { h, s, l } = hexToHsl(hex);
  return `hsl(${Math.round(h)}, ${Math.round(s)}%, ${Math.round(l)}%)`;
}

const HUE_NAMES: Array<[number, string]> = [
  [0, '빨강'], [20, '주황'], [40, '골드'], [55, '노랑'], [90, '연두'],
  [140, '초록'], [170, '청록'], [200, '하늘'], [225, '파랑'], [260, '남색'],
  [285, '보라'], [315, '자주'], [340, '핑크'], [360, '빨강'],
];

/** 정확한 색이름 사전이 아닌, 근사 톤을 설명하는 참고용 이름(예: "차분한 브라운"). */
export function nameColor(hex: string): string {
  const { h, s, l } = hexToHsl(hex);
  if (s < 8) {
    if (l > 90) return '화이트';
    if (l < 12) return '블랙';
    return l > 55 ? '연회색' : '진회색';
  }
  let best = HUE_NAMES[0][1];
  let bestDiff = 360;
  for (const [hue, name] of HUE_NAMES) {
    const diff = Math.abs(h - hue);
    if (diff < bestDiff) {
      bestDiff = diff;
      best = name;
    }
  }
  // 빨강~주황 계열이면서 어둡고 채도가 과하지 않으면 "브라운/고동색"으로 부르는 게 더 자연스럽다
  // (색상환 기준 최근접색만 쓰면 갈색이 전부 "진한 빨강/주황"으로 뭉개짐)
  const hue0to360 = h >= 350 ? h - 360 : h;
  if (hue0to360 <= 45 && l < 45 && s < 60) {
    return l < 20 ? '진한 브라운' : l > 32 ? '연한 브라운' : '브라운';
  }
  const tone = l > 80 ? '연한 ' : l < 25 ? '진한 ' : s < 30 ? '차분한 ' : '';
  return `${tone}${best}`;
}

export type HarmonyMode =
  | 'random' | 'complementary' | 'analogous' | 'monochromatic'
  | 'triadic' | 'warm' | 'cool' | 'pastel';

export const HARMONY_LABELS: Record<HarmonyMode, string> = {
  random: '랜덤 생성',
  complementary: '보색',
  analogous: '유사색',
  monochromatic: '단색',
  triadic: '삼색 조합',
  warm: '따뜻한 색',
  cool: '차가운 색',
  pastel: '파스텔',
};

/** 기준 색(baseHex)에서 하모니 규칙에 따라 5색 팔레트를 만든다. */
export function generateHarmony(baseHex: string, mode: HarmonyMode): string[] {
  const { h, s } = hexToHsl(baseHex);

  switch (mode) {
    case 'complementary': {
      const h2 = h + 180;
      return [
        hslToHex(h, s, 78),
        hslToHex(h, s, 55),
        hslToHex(h, s, 30),
        hslToHex(h2, s, 55),
        hslToHex(h2, s, 32),
      ];
    }
    case 'analogous':
      return [-30, -15, 0, 15, 30].map((d) => hslToHex(h + d, s, 55));
    case 'monochromatic':
      return [85, 68, 50, 33, 18].map((l) => hslToHex(h, Math.max(20, s), l));
    case 'triadic':
      return [
        hslToHex(h, s, 50),
        hslToHex(h, s, 28),
        hslToHex(h + 120, s, 50),
        hslToHex(h + 240, s, 50),
        hslToHex(h, Math.max(10, s - 35), 88),
      ];
    case 'warm':
      return [15, 30, 42, 8, 50].map((wh, i) => hslToHex(wh, Math.max(45, s), 42 + i * 9));
    case 'cool':
      return [195, 212, 230, 250, 205].map((ch, i) => hslToHex(ch, Math.max(35, s), 38 + i * 9));
    case 'pastel':
      return [-30, -15, 0, 15, 30].map((d) =>
        hslToHex(h + d, Math.min(45, Math.max(20, s * 0.5)), 84)
      );
    case 'random':
    default: {
      const modes: HarmonyMode[] = ['complementary', 'analogous', 'monochromatic', 'triadic'];
      const randomHue = Math.floor(Math.random() * 360);
      const randomMode = modes[Math.floor(Math.random() * modes.length)];
      return generateHarmony(hslToHex(randomHue, 55 + Math.random() * 30, 50), randomMode);
    }
  }
}

/**
 * 사용자가 지정한 색 자체를 첫 칸에 그대로 두고, 밝은 톤·어두운 톤·보색·분할보색을 붙여 5색을 만든다.
 * (generateHarmony 는 기준색의 명도를 버리고 규칙 명도로 덮어써서, 입력한 색이 팔레트에 남지 않는다)
 */
export function paletteFromBase(baseHex: string): string[] {
  const { h, s, l } = hexToHsl(baseHex);
  const sat = Math.max(15, s);
  return [
    baseHex.toUpperCase(),
    hslToHex(h, Math.min(100, sat * 0.5), Math.min(95, l + 30)),
    hslToHex(h, sat, Math.max(14, l - 30)),
    hslToHex(h + 180, sat, Math.min(75, Math.max(30, l))),
    hslToHex(h + 210, Math.min(100, sat * 0.7), Math.min(90, l + 18)),
  ];
}

/** 콘텐츠 카테고리별 참고 팔레트 (5색, 명도 내림차순 배치와 무관하게 큐레이션된 순서) */
export const CATEGORY_PALETTES: Record<string, string[]> = {
  '감성': ['#5C4B51', '#8C6A6A', '#F2E2DC', '#FAF3F0', '#2E2A28'],
  '모던': ['#111111', '#3A3A3A', '#EAEAEA', '#FFFFFF', '#FF3B30'],
  '고급': ['#1B1B1B', '#B08D57', '#E8DCC8', '#F5F1E8', '#4A3F3A'],
  '책·독서': ['#3B2F2F', '#8C6A43', '#E8DCC8', '#F5F1E8', '#222222'],
  '여행': ['#2A6F97', '#89C2D9', '#FFF3B0', '#F6AA1C', '#013A63'],
  '맛집': ['#D62828', '#F77F00', '#FCBF49', '#FFF3B0', '#003049'],
  '뷰티': ['#FF7AA2', '#FFD6E8', '#FFF0F5', '#C9184A', '#590D22'],
  '육아': ['#FFD6A5', '#FDFFB6', '#CAFFBF', '#9BF6FF', '#BDB2FF'],
  'IT': ['#0F172A', '#1E293B', '#38BDF8', '#F1F5F9', '#22D3EE'],
};

export interface PaletteRoles {
  background: string;
  text: string;
  accent: string;
  sub: string;
}

/**
 * 5색 팔레트에서 배경/텍스트/강조/보조 역할을 명도·채도 기준으로 자동 배정한다.
 * (AI 호출이 아닌 결정론적 휴리스틱 — 썸네일 미리보기용)
 */
export function assignRoles(hexes: string[]): PaletteRoles {
  const withHsl = hexes.map((hex) => ({ hex, ...hexToHsl(hex) }));
  const byLight = [...withHsl].sort((a, b) => b.l - a.l);
  const background = byLight[0]?.hex ?? '#FFFFFF';
  const text = byLight[byLight.length - 1]?.hex ?? '#111111';
  const remaining = withHsl.filter((c) => c.hex !== background && c.hex !== text);
  const bySat = [...remaining].sort((a, b) => b.s - a.s);
  const accent = bySat[0]?.hex ?? byLight[1]?.hex ?? background;
  const sub = remaining.find((c) => c.hex !== accent)?.hex ?? bySat[1]?.hex ?? text;
  return { background, text, accent, sub };
}
