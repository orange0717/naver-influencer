import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'N인플 — 네이버 인플루언서 플랫폼',
    short_name: 'N인플',
    description: '네이버 인플루언서 키워드챌린지 순위·검색량·경쟁도 분석 플랫폼',
    start_url: '/',
    display: 'standalone',
    background_color: '#FDF6F3',
    theme_color: '#BF877A',
    icons: [
      {
        src: '/icon-192.png',
        sizes: '192x192',
        type: 'image/png',
      },
      {
        src: '/icon-512.png',
        sizes: '512x512',
        type: 'image/png',
      },
    ],
  };
}
