import { NextResponse } from 'next/server';

const WIDGET_HEADERS = {
  'Content-Type': 'image/svg+xml',
  'Cache-Control': 'public, max-age=3600',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET',
};

/**
 * 위젯 SVG 응답을 CORS 헤더와 함께 반환한다.
 */
export function widgetResponse(svg: string): NextResponse {
  return new NextResponse(svg, { headers: WIDGET_HEADERS });
}
