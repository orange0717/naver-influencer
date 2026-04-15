/**
 * 크롬 확장앱 아이콘 생성 스크립트
 * Node.js 기본 모듈만 사용하여 PNG 아이콘 생성
 */
const fs = require('fs');
const zlib = require('zlib');

function createPNG(width, height, rgbColor) {
  // PNG 파일 구조: Signature + IHDR + IDAT + IEND

  // 1. PNG Signature
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

  // 2. IHDR chunk
  const ihdrData = Buffer.alloc(13);
  ihdrData.writeUInt32BE(width, 0);   // width
  ihdrData.writeUInt32BE(height, 4);  // height
  ihdrData.writeUInt8(8, 8);          // bit depth
  ihdrData.writeUInt8(2, 9);          // color type (RGB)
  ihdrData.writeUInt8(0, 10);         // compression
  ihdrData.writeUInt8(0, 11);         // filter
  ihdrData.writeUInt8(0, 12);         // interlace

  const ihdr = createChunk('IHDR', ihdrData);

  // 3. IDAT chunk - pixel data
  const rawData = Buffer.alloc(height * (1 + width * 3)); // filter byte + RGB per pixel

  const [r, g, b] = rgbColor;

  // 둥근 모서리 + N 문자를 그리기
  const cornerRadius = Math.floor(width * 0.18);

  for (let y = 0; y < height; y++) {
    const rowOffset = y * (1 + width * 3);
    rawData[rowOffset] = 0; // filter: none

    for (let x = 0; x < width; x++) {
      const pixelOffset = rowOffset + 1 + x * 3;

      // 둥근 모서리 체크
      const inRoundedRect = isInRoundedRect(x, y, width, height, cornerRadius);

      if (!inRoundedRect) {
        // 투명 대신 흰색 (PNG RGB는 투명 불가)
        rawData[pixelOffset] = 255;
        rawData[pixelOffset + 1] = 255;
        rawData[pixelOffset + 2] = 255;
        continue;
      }

      // N 문자 렌더링
      const isN = isInLetterN(x, y, width, height);

      if (isN) {
        // 흰색 N
        rawData[pixelOffset] = 255;
        rawData[pixelOffset + 1] = 255;
        rawData[pixelOffset + 2] = 255;
      } else {
        // 오렌지 배경
        rawData[pixelOffset] = r;
        rawData[pixelOffset + 1] = g;
        rawData[pixelOffset + 2] = b;
      }
    }
  }

  const compressed = zlib.deflateSync(rawData);
  const idat = createChunk('IDAT', compressed);

  // 4. IEND chunk
  const iend = createChunk('IEND', Buffer.alloc(0));

  return Buffer.concat([signature, ihdr, idat, iend]);
}

function createChunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);

  const typeBuffer = Buffer.from(type, 'ascii');
  const crcData = Buffer.concat([typeBuffer, data]);

  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(crcData), 0);

  return Buffer.concat([length, typeBuffer, data, crc]);
}

// CRC32 계산
function crc32(buf) {
  let crc = 0xFFFFFFFF;
  for (let i = 0; i < buf.length; i++) {
    crc ^= buf[i];
    for (let j = 0; j < 8; j++) {
      crc = (crc >>> 1) ^ (crc & 1 ? 0xEDB88320 : 0);
    }
  }
  return (crc ^ 0xFFFFFFFF) >>> 0;
}

function isInRoundedRect(x, y, w, h, r) {
  // 네 모서리 체크
  if (x < r && y < r) {
    return (r - x) * (r - x) + (r - y) * (r - y) <= r * r;
  }
  if (x >= w - r && y < r) {
    return (x - (w - r - 1)) * (x - (w - r - 1)) + (r - y) * (r - y) <= r * r;
  }
  if (x < r && y >= h - r) {
    return (r - x) * (r - x) + (y - (h - r - 1)) * (y - (h - r - 1)) <= r * r;
  }
  if (x >= w - r && y >= h - r) {
    return (x - (w - r - 1)) * (x - (w - r - 1)) + (y - (h - r - 1)) * (y - (h - r - 1)) <= r * r;
  }
  return true;
}

function isInLetterN(x, y, w, h) {
  // N 글자를 비트맵으로 간단히 렌더링
  const margin = Math.floor(w * 0.22);
  const strokeW = Math.max(2, Math.floor(w * 0.15));

  const left = margin;
  const right = w - margin;
  const top = margin;
  const bottom = h - margin;

  // N의 구성: 왼쪽 세로 | 대각선 \ | 오른쪽 세로
  if (x < left || x >= right || y < top || y >= bottom) return false;

  const innerW = right - left;
  const innerH = bottom - top;
  const relX = x - left;
  const relY = y - top;

  // 왼쪽 세로선
  if (relX < strokeW) return true;

  // 오른쪽 세로선
  if (relX >= innerW - strokeW) return true;

  // 대각선 (왼쪽 위에서 오른쪽 아래로)
  const diagPos = (relY / innerH) * innerW;
  if (Math.abs(relX - diagPos) < strokeW * 0.8) return true;

  return false;
}

// 아이콘 생성
const sizes = [16, 48, 128];
const orangeColor = [191, 137, 132]; // #BF8984

sizes.forEach(size => {
  const png = createPNG(size, size, orangeColor);
  const path = `${__dirname}/icons/icon${size}.png`;
  fs.writeFileSync(path, png);
  console.log(`Created: icon${size}.png (${png.length} bytes)`);
});

console.log('All icons created!');
