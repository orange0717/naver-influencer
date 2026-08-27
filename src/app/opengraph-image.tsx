import { ImageResponse } from 'next/og';
import { STAT_TEXT } from '@/lib/site-stats';

export const runtime = 'edge';
export const alt = 'N인플 — 네이버 인플루언서들을 위한 플랫폼';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

export default async function Image() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          background: '#F7F7F5',
          padding: 80,
          position: 'relative',
        }}
      >
        <div
          style={{
            position: 'absolute',
            top: 60,
            left: 80,
            fontSize: 28,
            color: '#83817A',
            letterSpacing: 2,
            fontWeight: 600,
          }}
        >
          NINFLE.KR
        </div>
        <div
          style={{
            fontSize: 160,
            fontWeight: 900,
            color: '#BF877A',
            lineHeight: 1,
            letterSpacing: -4,
            display: 'flex',
          }}
        >
          N인플
        </div>
        <div
          style={{
            marginTop: 28,
            fontSize: 44,
            fontWeight: 700,
            color: '#3D2E26',
            display: 'flex',
            textAlign: 'center',
          }}
        >
          네이버 인플루언서·블로거를 위한
        </div>
        <div
          style={{
            marginTop: 8,
            fontSize: 44,
            fontWeight: 700,
            color: '#3D2E26',
            display: 'flex',
            textAlign: 'center',
          }}
        >
          키워드 분석 플랫폼
        </div>
        <div
          style={{
            marginTop: 36,
            display: 'flex',
            gap: 16,
          }}
        >
          {['키워드 분석', '인플루언서 랭킹', '블로그 품질지수'].map((label) => (
            <div
              key={label}
              style={{
                padding: '10px 24px',
                background: '#FFFFFF',
                color: '#BF877A',
                fontSize: 24,
                fontWeight: 600,
                borderRadius: 999,
                border: '2px solid #D9ABA0',
                display: 'flex',
              }}
            >
              {label}
            </div>
          ))}
        </div>
        <div
          style={{
            position: 'absolute',
            bottom: 60,
            right: 80,
            fontSize: 24,
            color: '#83817A',
            display: 'flex',
          }}
        >
          {`인플루언서 ${STAT_TEXT.influencers} · 블로거 ${STAT_TEXT.bloggers}`}
        </div>
      </div>
    ),
    { ...size },
  );
}
