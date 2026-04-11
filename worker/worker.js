/**
 * N인플 네이버 블로그 API 프록시 — Cloudflare Worker
 *
 * PostTitleListAsync API는 한국 서버에서만 접근 가능하므로
 * Cloudflare Worker를 통해 프록시합니다.
 *
 * 엔드포인트:
 *   GET /blog-posts?blogId=xxx&page=1&count=30
 *
 * 배포:
 *   npx wrangler deploy worker/worker.js --name ninfl-proxy
 */

export default {
  async fetch(request) {
    const url = new URL(request.url);

    // CORS Preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type',
          'Access-Control-Max-Age': '86400',
        },
      });
    }

    if (url.pathname === '/blog-posts' && request.method === 'GET') {
      return handleBlogPosts(url);
    }

    return new Response(JSON.stringify({ error: 'Not found', endpoints: ['GET /blog-posts?blogId=xxx&page=1&count=30'] }), {
      status: 404,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    });
  },
};

async function handleBlogPosts(url) {
  const blogId = url.searchParams.get('blogId');
  const page = url.searchParams.get('page') || '1';
  const count = url.searchParams.get('count') || '30';

  if (!blogId) {
    return jsonRes({ error: 'blogId required' }, 400);
  }

  try {
    const naverUrl = `https://blog.naver.com/PostTitleListAsync.naver?blogId=${encodeURIComponent(blogId)}&currentPage=${page}&countPerPage=${count}`;
    const res = await fetch(naverUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
        'Accept': '*/*',
        'Accept-Language': 'ko-KR,ko;q=0.9',
        'Referer': `https://blog.naver.com/${blogId}`,
      },
    });

    if (!res.ok) {
      return jsonRes({ error: 'Naver API failed', status: res.status }, 502);
    }

    // PostTitleListAsync는 비표준 JSON을 반환 (이스케이프 문자 포함)
    let text = await res.text();
    // 잘못된 이스케이프 시퀀스 정제
    text = text.replace(/\\'/g, "'");

    let data;
    try {
      data = JSON.parse(text);
    } catch {
      // 파싱 실패 시 원본 텍스트 그대로 반환
      return new Response(text, {
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
        },
      });
    }

    return new Response(JSON.stringify(data), {
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Cache-Control': 'public, max-age=300',
      },
    });
  } catch (e) {
    return jsonRes({ error: e.message }, 500);
  }
}

function jsonRes(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
    },
  });
}
