/**
 * 업로드 이미지에서 대표 색상을 추출하는 median-cut 팔레트 알고리즘.
 * 서버 호출 없이 브라우저 canvas의 ImageData만으로 동작한다 (AI API 비용 없음).
 */

export interface RGB {
  r: number;
  g: number;
  b: number;
}

interface ColorBox {
  pixels: RGB[];
}

type Channel = 'r' | 'g' | 'b';

function widestChannel(box: ColorBox): Channel {
  let rMin = 255, rMax = 0, gMin = 255, gMax = 0, bMin = 255, bMax = 0;
  for (const p of box.pixels) {
    if (p.r < rMin) rMin = p.r;
    if (p.r > rMax) rMax = p.r;
    if (p.g < gMin) gMin = p.g;
    if (p.g > gMax) gMax = p.g;
    if (p.b < bMin) bMin = p.b;
    if (p.b > bMax) bMax = p.b;
  }
  const ranges: Array<{ channel: Channel; range: number }> = [
    { channel: 'r', range: rMax - rMin },
    { channel: 'g', range: gMax - gMin },
    { channel: 'b', range: bMax - bMin },
  ];
  return ranges.reduce((a, b) => (b.range > a.range ? b : a)).channel;
}

function splitBox(box: ColorBox): [ColorBox, ColorBox] {
  const channel = widestChannel(box);
  const sorted = [...box.pixels].sort((a, b) => a[channel] - b[channel]);
  const mid = Math.floor(sorted.length / 2);
  return [{ pixels: sorted.slice(0, mid) }, { pixels: sorted.slice(mid) }];
}

function averageColor(box: ColorBox): RGB {
  const n = box.pixels.length || 1;
  let r = 0, g = 0, b = 0;
  for (const p of box.pixels) {
    r += p.r;
    g += p.g;
    b += p.b;
  }
  return { r: Math.round(r / n), g: Math.round(g / n), b: Math.round(b / n) };
}

/** 팔레트가 count보다 적게 뽑히면 마지막 색을 살짝 밝게/어둡게 변형해 개수를 채운다. */
function padToCount(colors: RGB[], count: number): RGB[] {
  const out = [...colors];
  let step = 1;
  while (out.length < count && out.length > 0) {
    const base = out[out.length - 1];
    const delta = 18 * step * (step % 2 === 0 ? -1 : 1);
    out.push({
      r: Math.min(255, Math.max(0, base.r + delta)),
      g: Math.min(255, Math.max(0, base.g + delta)),
      b: Math.min(255, Math.max(0, base.b + delta)),
    });
    step += 1;
  }
  return out;
}

/**
 * RGBA 픽셀 버퍼에서 median-cut으로 대표 색상 `count`개를 추출한다.
 * 픽셀이 많은(비중이 큰) 색 순서로 정렬해 반환 — 첫 번째가 "대표 색상".
 * 브라우저 canvas의 ImageData(Uint8ClampedArray)와 서버(sharp 등)의 Uint8Array 버퍼 둘 다 받는다
 * (구조가 같은 { data, width, height } 형태이면 무엇이든 동작 — 실제로 쓰는 건 data뿐).
 */
export function extractPalette(imageData: { data: Uint8ClampedArray | Uint8Array }, count = 5): RGB[] {
  const { data } = imageData;
  const totalPixels = data.length / 4;
  const step = Math.max(1, Math.floor(totalPixels / 20000)); // 최대 2만 픽셀만 샘플링(성능)

  const pixels: RGB[] = [];
  for (let i = 0; i < totalPixels; i += step) {
    const idx = i * 4;
    if (data[idx + 3] < 128) continue; // 투명 픽셀 제외
    pixels.push({ r: data[idx], g: data[idx + 1], b: data[idx + 2] });
  }
  if (pixels.length === 0) return padToCount([{ r: 191, g: 135, b: 122 }], count);

  const boxes: ColorBox[] = [{ pixels }];
  while (boxes.length < count) {
    boxes.sort((a, b) => b.pixels.length - a.pixels.length);
    const target = boxes[0];
    if (target.pixels.length < 2) break; // 더 못 쪼갬
    boxes.shift();
    boxes.push(...splitBox(target));
  }

  boxes.sort((a, b) => b.pixels.length - a.pixels.length);
  return padToCount(boxes.map(averageColor), count);
}
