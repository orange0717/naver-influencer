import { NextRequest, NextResponse } from 'next/server';
import sharp from 'sharp';
import { getClientIp, imageConvertLimiter, rateLimitResponse } from '@/lib/rate-limit';
import { internalError } from '@/lib/api-response';

const ALLOWED_TYPES = ['image/jpeg', 'image/png'];
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

export async function POST(request: NextRequest) {
  const ip = getClientIp(request);
  if (await imageConvertLimiter.check(ip)) {
    return rateLimitResponse();
  }

  try {
    const formData = await request.formData();
    const files = formData.getAll('files') as File[];

    if (files.length === 0) {
      return NextResponse.json(
        { error: '파일을 선택해주세요.' },
        { status: 400 },
      );
    }

    if (files.length !== 1) {
      return NextResponse.json(
        { error: '안정적인 변환을 위해 한 번에 1개 파일만 변환합니다.' },
        { status: 400 },
      );
    }

    const file = files[0]!;

    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        { error: '10MB 이하 이미지만 변환할 수 있습니다.' },
        { status: 400 },
      );
    }

    if (!ALLOWED_TYPES.includes(file.type)) {
      return NextResponse.json(
        { error: `지원하지 않는 파일 형식입니다: ${file.name}. JPG, PNG만 지원합니다.` },
        { status: 400 },
      );
    }

    let convertedBuffer: Buffer;
    let outputMimeType: string;
    let outputExt: string;

    try {
      const buffer = await file.arrayBuffer();
      const bufferData = Buffer.from(buffer);

      if (file.type === 'image/jpeg') {
        convertedBuffer = await sharp(bufferData).png({ quality: 95 }).toBuffer();
        outputMimeType = 'image/png';
        outputExt = '.png';
      } else {
        convertedBuffer = await sharp(bufferData)
          .flatten({ background: { r: 255, g: 255, b: 255 } })
          .jpeg({ quality: 95 })
          .toBuffer();
        outputMimeType = 'image/jpeg';
        outputExt = '.jpg';
      }
    } catch {
      return NextResponse.json(
        { error: `파일 변환 중 오류가 발생했습니다: ${file.name}. 유효한 이미지 파일인지 확인하세요.` },
        { status: 400 },
      );
    }

    const nameWithoutExt = file.name.replace(/\.[^/.]+$/, '');
    const newFileName = `${nameWithoutExt}${outputExt}`;

    return new NextResponse(new Uint8Array(convertedBuffer), {
      headers: {
        'content-type': outputMimeType,
        'content-disposition': `attachment; filename="${encodeURIComponent(newFileName)}"`,
        'x-output-filename': encodeURIComponent(newFileName),
      },
    });
  } catch (error) {
    return internalError('tools/convert-image', error, '이미지 변환 중 오류가 발생했습니다. 다시 시도해주세요.');
  }
}
