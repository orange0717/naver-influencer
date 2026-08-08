/**
 * 원격 썸네일 이미지(예: 유튜브 썸네일)에서 컬러 팔레트를 추출한다.
 * 브라우저 canvas 기반 추출(src/app/dashboard/writing/color-palette)은 파일 업로드 전용이라
 * 원격 URL(CORS 미허용)에는 못 쓴다 — 서버에서 fetch + sharp로 디코딩한 뒤
 * 기존 median-cut 알고리즘(src/lib/color-extract.ts)을 그대로 재사용한다.
 */
import sharp from 'sharp';
import { extractPalette } from './color-extract';
import { rgbToHex } from './color-harmony';

const MAX_DIMENSION = 200; // 색상 추출용 다운스케일 — 속도만 좌우, 화질과 무관 (color-palette 페이지와 동일 기준)
const FETCH_TIMEOUT_MS = 10_000;

export async function extractThumbnailPalette(imageUrl: string, count = 5): Promise<string[] | null> {
  try {
    const res = await fetch(imageUrl, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
    if (!res.ok) return null;
    const arrayBuffer = await res.arrayBuffer();

    const { data, info } = await sharp(Buffer.from(arrayBuffer))
      .resize(MAX_DIMENSION, MAX_DIMENSION, { fit: 'inside', withoutEnlargement: true })
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });

    void info; // width/height는 extractPalette가 쓰지 않음(픽셀 배열만 순회)
    const colors = extractPalette({ data: new Uint8Array(data) }, count);
    return colors.map((c) => rgbToHex(c.r, c.g, c.b));
  } catch (err) {
    console.error('[thumbnail-palette] 추출 실패:', err instanceof Error ? err.message : err);
    return null;
  }
}
