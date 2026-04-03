/**
 * PWA/앱 아이콘 생성 스크립트
 * Canvas API를 사용하여 N인플 로고 아이콘을 생성합니다.
 *
 * 사용법: node scripts/generate-icons.mjs
 *
 * 참고: 실제 앱스토어 제출 시에는 전문 디자인 아이콘으로 교체하세요.
 */

import { writeFileSync } from 'fs';

// SVG 기반 아이콘 생성 (PNG 변환은 별도 도구 필요)
function generateSVGIcon(size) {
  const radius = Math.round(size * 0.22);
  const fontSize = Math.round(size * 0.45);

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <rect width="${size}" height="${size}" rx="${radius}" fill="#E4C1B8"/>
  <text x="50%" y="54%" dominant-baseline="middle" text-anchor="middle"
    font-family="'Noto Serif KR', Georgia, serif" font-weight="900" font-size="${fontSize}" fill="white">N</text>
</svg>`;
}

// SVG 파일 생성
const sizes = [192, 512, 1024];
for (const size of sizes) {
  const svg = generateSVGIcon(size);
  writeFileSync(`public/icons/icon-${size}.svg`, svg);
  console.log(`Generated icon-${size}.svg`);
}

// favicon.svg (브라우저 탭)
const faviconSvg = generateSVGIcon(32);
writeFileSync('public/favicon.svg', faviconSvg);
console.log('Generated favicon.svg');

console.log('\nSVG 아이콘 생성 완료!');
console.log('PNG 변환이 필요한 경우: npx @nicepkg/svg2png 또는 온라인 도구를 사용하세요.');
console.log('앱스토어 제출 시에는 전문 디자인 아이콘으로 교체하세요.');
