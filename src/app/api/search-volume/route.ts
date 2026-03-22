import { NextRequest, NextResponse } from 'next/server';
import { createHmac } from 'crypto';

export const dynamic = 'force-dynamic';

/** CORS 헤더 (크롬 확장앱에서 호출 가능하도록) */
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

/** OPTIONS preflight */
export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: corsHeaders });
}

/** Node.js crypto 모듈로 HMAC-SHA256 서명 생성 */
function generateSignature(timestamp: string, method: string, path: string, secretKey: string): string {
  const message = `${timestamp}.${method}.${path}`;
  return createHmac('sha256', secretKey)
    .update(message)
    .digest('base64');
}

export async function GET(request: NextRequest) {
  const keyword = request.nextUrl.searchParams.get('keyword');

  if (!keyword) {
    return NextResponse.json({ error: '키워드를 입력해주세요.' }, { status: 400, headers: corsHeaders });
  }

  const apiKey = process.env.NAVER_API_KEY?.trim();
  const secretKey = process.env.NAVER_SECRET_KEY?.trim();
  const customerId = process.env.NAVER_CUSTOMER_ID?.trim();

  if (!apiKey || !secretKey || !customerId) {
    return NextResponse.json(
      { error: 'API 키가 설정되지 않았습니다. 관리자에게 문의하세요.' },
      { status: 503, headers: corsHeaders }
    );
  }

  try {
    const timestamp = String(Date.now());
    const signature = generateSignature(timestamp, 'GET', '/keywordstool', secretKey);

    const url = `https://api.searchad.naver.com/keywordstool?hintKeywords=${encodeURIComponent(keyword)}&showDetail=1`;

    const res = await fetch(url, {
      method: 'GET',
      headers: {
        'X-Timestamp': timestamp,
        'X-API-KEY': apiKey,
        'X-Customer': customerId,
        'X-Signature': signature,
      },
    });

    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      return NextResponse.json(
        { error: errData.detail || `API 오류 (${res.status})` },
        { status: res.status, headers: corsHeaders }
      );
    }

    const data = await res.json();
    const keywords = (data.keywordList || []).map((kw: Record<string, unknown>) => {
      const pc = typeof kw.monthlyPcQcCnt === 'number' ? kw.monthlyPcQcCnt : 0;
      const mobile = typeof kw.monthlyMobileQcCnt === 'number' ? kw.monthlyMobileQcCnt : 0;
      const total = (typeof pc === 'number' && typeof mobile === 'number') ? pc + mobile : '< 10';

      const comp = kw.compIdx as string;
      let competition = '낮음';
      if (comp === 'HIGH') competition = '높음';
      else if (comp === 'MEDIUM') competition = '중간';

      return {
        keyword: kw.relKeyword,
        monthlyPc: pc || '< 10',
        monthlyMobile: mobile || '< 10',
        monthlyTotal: total,
        competition,
      };
    });

    return NextResponse.json({ keywords }, { headers: corsHeaders });
  } catch (err) {
    return NextResponse.json(
      { error: '검색량 조회에 실패했습니다.' },
      { status: 500, headers: corsHeaders }
    );
  }
}
