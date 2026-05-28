import { NextRequest, NextResponse } from 'next/server';
import sharp from 'sharp';

const MAX_FILES = 20;
const ALLOWED_TYPES = ['image/jpeg', 'image/png'];

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const files = formData.getAll('files') as File[];

    // 파일 개수 검증
    if (files.length === 0) {
      return NextResponse.json(
        { error: '파일을 선택해주세요.' },
        { status: 400 }
      );
    }

    if (files.length > MAX_FILES) {
      return NextResponse.json(
        { error: `최대 ${MAX_FILES}장까지만 업로드 가능합니다.` },
        { status: 400 }
      );
    }

    // 파일 타입 및 변환 로직
    const convertedFiles: Array<{
      name: string;
      buffer: Buffer;
      mimeType: string;
    }> = [];

    for (const file of files) {
      // 파일 타입 검증
      if (!ALLOWED_TYPES.includes(file.type)) {
        return NextResponse.json(
          { error: `지원하지 않는 파일 형식입니다: ${file.name}. JPG, PNG만 지원합니다.` },
          { status: 400 }
        );
      }

      try {
        const buffer = await file.arrayBuffer();
        const bufferData = Buffer.from(buffer);

        // JPG → PNG 또는 PNG → JPG 변환
        let convertedBuffer: Buffer;
        let outputMimeType: string;
        let outputExt: string;

        if (file.type === 'image/jpeg') {
          // JPG → PNG
          convertedBuffer = await sharp(bufferData)
            .png({ quality: 95 })
            .toBuffer();
          outputMimeType = 'image/png';
          outputExt = '.png';
        } else {
          // PNG → JPG
          convertedBuffer = await sharp(bufferData)
            .flatten({ background: { r: 255, g: 255, b: 255 } })
            .jpeg({ quality: 95 })
            .toBuffer();
          outputMimeType = 'image/jpeg';
          outputExt = '.jpg';
        }

        // 파일명 변경 (확장자 변경)
        const nameWithoutExt = file.name.replace(/\.[^/.]+$/, '');
        const newFileName = `${nameWithoutExt}${outputExt}`;

        convertedFiles.push({
          name: newFileName,
          buffer: convertedBuffer,
          mimeType: outputMimeType,
        });
      } catch (error) {
        return NextResponse.json(
          {
            error: `파일 변환 중 오류가 발생했습니다: ${file.name}. 유효한 이미지 파일인지 확인하세요.`
          },
          { status: 400 }
        );
      }
    }

    // 변환된 파일들을 JSON 응답으로 반환
    const filesData = convertedFiles.map(f => ({
      name: f.name,
      data: f.buffer.toString('base64'),
      mimeType: f.mimeType,
    }));

    return NextResponse.json({
      success: true,
      files: filesData,
      count: convertedFiles.length,
    });
  } catch (error) {
    console.error('Image conversion error:', error);
    return NextResponse.json(
      { error: '이미지 변환 중 오류가 발생했습니다. 다시 시도해주세요.' },
      { status: 500 }
    );
  }
}
