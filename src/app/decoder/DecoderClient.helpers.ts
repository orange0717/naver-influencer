// ──────────────────────────────────────────────────────────
// 파라미터 매핑 테이블
// ──────────────────────────────────────────────────────────

export type Strength = 'very-strong' | 'strong' | 'medium' | 'weak' | 'unknown';

export const SM_TABLE: Record<string, { label: string; strength: Strength }> = {
  top_hty: { label: '검색창 "검색기록" 클릭 (재방문)', strength: 'very-strong' },
  top_hky: { label: '검색창 직접 타이핑 후 엔터', strength: 'strong' },
  top_sug: { label: '검색창 자동완성 클릭', strength: 'medium' },
  top_rcm: { label: '추천 검색어 클릭', strength: 'weak' },
  top_rmd: { label: '추천 영역 클릭', strength: 'weak' },
  top_lve: { label: '라이브 검색', strength: 'unknown' },
  mtp_hty: { label: '모바일 검색기록 클릭 (재방문)', strength: 'very-strong' },
  mtp_hky: { label: '모바일 직접 입력', strength: 'strong' },
  mtp_sug: { label: '모바일 자동완성', strength: 'medium' },
  mtp_rcm: { label: '모바일 추천 검색어', strength: 'weak' },
  tab_jum: { label: '검색 결과 점프', strength: 'unknown' },
  tab_pge: { label: '검색 결과 페이지 이동', strength: 'unknown' },
};

export const STRENGTH_META: Record<Strength, { label: string; short: string; cls: string }> = {
  'very-strong': { label: '매우 강 · 충성 방문 신호', short: '매우강', cls: 'text-emerald-700 bg-emerald-100 border border-emerald-200' },
  'strong': { label: '강 · 명확한 브랜드 인지', short: '강', cls: 'text-blue-700 bg-blue-100 border border-blue-200' },
  'medium': { label: '중 · 인지는 있음', short: '중', cls: 'text-amber-700 bg-amber-100 border border-amber-200' },
  'weak': { label: '약 · 수동적 발견', short: '약', cls: 'text-rose-700 bg-rose-100 border border-rose-200' },
  'unknown': { label: '분류 외', short: '?', cls: 'text-gray-700 bg-gray-100 border border-gray-200' },
};

export const TRACKING_TABLE: Record<string, string> = {
  nx: '네이버 통합검색',
  blog: '블로그 검색',
  post: '포스트 검색',
  view: 'VIEW 탭',
  cafe: '카페 검색',
  influencer: '인플루언서 검색',
  nx_others: '검색 기타 영역',
  external: '외부 도메인 유입 (네이버가 외부로 분류)',
  internal: '네이버 내부 영역',
};

export const WHERE_TABLE: Record<string, string> = {
  nexearch: '통합검색',
  view: 'VIEW 탭',
  post: '포스트 검색',
  blog: '블로그 검색',
  m_view: '모바일 VIEW',
  m_blog: '모바일 블로그',
  m: '모바일 통합검색',
  influencer: '인플루언서',
};

// ──────────────────────────────────────────────────────────
// URL 파싱
// ──────────────────────────────────────────────────────────

export interface DecodedNaverUrl {
  raw: string;
  valid: boolean;
  error?: string;
  hostname?: string;
  pathname?: string;
  surface?: string;
  blogId?: string;
  query?: string;
  queryParam?: 'query' | 'keyword' | 'q';
  smCode?: string;
  trackingCode?: string;
  where?: string;
  directAccess?: boolean;
  ackey?: string;
  pageNo?: string;
  logNo?: string;
  range?: string;
  orderBy?: string;
  directoryNo?: string;
  groupId?: string;
  topReferer?: string;
  topRefererDecoded?: DecodedNaverUrl;
  rawParams: Array<{ key: string; value: string }>;
}

function classifySurface(host: string, path: string): string {
  // 네이버 사내 시스템 (navercorp.com) — 직원/관리자용
  if (/(^|\.)navercorp\.com$/.test(host)) {
    if (/admin.*influencer|influencer.*admin/.test(host)) return '네이버 인플루언서팀 어드민';
    if (/influencer/.test(host)) return '네이버 인플루언서팀 사내 시스템';
    if (/admin/.test(host)) return '네이버 사내 어드민';
    return '네이버 사내 시스템 (navercorp.com)';
  }
  // 검색 섹션은 blog.naver.com 정규식보다 먼저 분기
  if (/^section\.blog\.naver\.com$/.test(host)) {
    if (path.includes('NickAndId')) return '블로그 검색 (닉네임·아이디)';
    if (path.includes('Search/Post')) return '블로그 검색 (포스트)';
    if (path.includes('Search/Influencer')) return '블로그 검색 (인플루언서)';
    if (path.includes('Search')) return '블로그 검색';
    if (path.includes('BlogHome')) return '블로그 섹션 홈 (카테고리·그룹 둘러보기)';
    if (path.includes('TopList')) return '블로그 인기글 (TopList)';
    if (path.includes('ChannelList')) return '블로그 채널 목록';
    if (path.includes('ThemePost')) return '블로그 주제별 글';
    return '블로그 섹션';
  }
  if (/^section\.cafe\.naver\.com$/.test(host)) return '카페 검색';
  if (/blog\.naver\.com$/.test(host)) {
    if (path.includes('PrologueList')) return '블로그 프롤로그 (전체글 목록)';
    if (path.includes('PostView')) return '블로그 포스트';
    if (path.includes('PostList')) return '블로그 글 목록';
    if (path.includes('BlogHome')) return '블로그 홈';
    if (/^\/[\w-]+\/?$/.test(path)) return '블로그 메인';
    if (/^\/[\w-]+\/\d+/.test(path)) return '블로그 포스트';
    return '블로그';
  }
  if (/search\.naver\.com$/.test(host)) return '네이버 검색 결과';
  if (/in\.naver\.com$/.test(host)) return '네이버 인플루언서';
  if (/cafe\.naver\.com$/.test(host)) return '네이버 카페';
  if (/post\.naver\.com$/.test(host)) return '네이버 포스트';
  if (/shopping\.naver\.com$/.test(host)) return '네이버 쇼핑';
  if (/map\.naver\.com$/.test(host) || /place\.naver\.com$/.test(host)) return '네이버 지도/장소';
  if (host === 'naver.com' || host === 'www.naver.com' || host === 'm.naver.com') return '네이버 메인';
  if (host.endsWith('naver.com')) return '네이버 내부';
  return `외부 사이트 (${host})`;
}

// 검색 결과 페이지 (자체에 검색어 파라미터를 담는 페이지) 판별
function isSearchPage(host: string): boolean {
  return (
    /search\.naver\.com$/.test(host) ||
    /^section\.blog\.naver\.com$/.test(host) ||
    /^section\.cafe\.naver\.com$/.test(host) ||
    /shopping\.naver\.com$/.test(host)
  );
}

export function decode(rawUrl: string, depth = 0): DecodedNaverUrl {
  const result: DecodedNaverUrl = { raw: rawUrl, valid: false, rawParams: [] };
  const trimmed = rawUrl.trim();
  if (!trimmed) return result;

  try {
    const url = new URL(trimmed);
    result.valid = true;
    result.hostname = url.hostname;
    result.pathname = url.pathname;
    result.surface = classifySurface(url.hostname, url.pathname);

    const params = url.searchParams;
    for (const [k, v] of params) {
      result.rawParams.push({ key: k, value: v });
    }

    result.blogId = params.get('blogId') || undefined;

    // query 파라미터: query → keyword → q 순으로 fallback (네이버 페이지마다 다름)
    const q = params.get('query');
    const k = params.get('keyword');
    const qShort = params.get('q');
    if (q) {
      result.query = q;
      result.queryParam = 'query';
    } else if (k) {
      result.query = k;
      result.queryParam = 'keyword';
    } else if (qShort) {
      result.query = qShort;
      result.queryParam = 'q';
    }

    result.smCode = params.get('sm') || undefined;
    result.trackingCode = params.get('trackingCode') || undefined;
    result.where = params.get('where') || undefined;
    result.directAccess = params.get('directAccess') === 'true';
    result.ackey = params.get('ackey') || undefined;
    result.pageNo =
      params.get('pageNo') ||
      params.get('page') ||
      params.get('start') ||
      params.get('currentPage') ||
      undefined;
    result.logNo = params.get('logNo') || undefined;
    result.range = params.get('range') || params.get('period') || undefined;
    result.orderBy = params.get('orderBy') || params.get('sort') || undefined;
    result.directoryNo = params.get('directoryNo') || undefined;
    result.groupId = params.get('groupId') || undefined;

    const tr = params.get('topReferer');
    if (tr) {
      result.topReferer = tr;
      if (depth < 2) {
        const decodedRef = decode(tr, depth + 1);
        if (decodedRef.valid) result.topRefererDecoded = decodedRef;
      }
    }
  } catch (e) {
    result.error = e instanceof Error ? e.message : '알 수 없는 오류';
  }
  return result;
}

// ──────────────────────────────────────────────────────────
// 한 줄 해석 + 의도 라벨
// ──────────────────────────────────────────────────────────

export interface Intent {
  label: string;
  icon: string;
  sentence: string;
  cls: string;
}

export function summarize(d: DecodedNaverUrl): Intent {
  if (!d.valid) {
    return { label: '분석 불가', icon: '⚠️', sentence: 'URL 형식이 올바르지 않습니다.', cls: 'bg-gray-100 text-gray-700 border-gray-200' };
  }

  const ref = d.topRefererDecoded;
  const surface = d.surface || '페이지';
  const target = d.blogId ? `@${d.blogId.replace(/_$/, '')} ${surface}` : surface;
  const refHost = ref?.hostname || '';
  const isNaverHost = (h: string) => /(^|\.)naver\.com$/.test(h);
  const isNaverCorpHost = (h: string) => /(^|\.)navercorp\.com$/.test(h);

  // 네이버 사내 시스템 (navercorp.com)에서 유입 — 직원·어드민 클릭
  if (ref && refHost && isNaverCorpHost(refHost)) {
    const refSurface = ref.surface || '네이버 사내 시스템';
    const isInfluencerTeam = /influencer/.test(refHost);
    const teamNote = isInfluencerTeam
      ? '네이버 인플루언서팀이 모니터링·확인한 트래픽'
      : '네이버 직원/관리자가 클릭한 트래픽';
    return {
      label: isInfluencerTeam ? '인플루언서팀 유입' : '사내 어드민 유입',
      icon: '🏢',
      sentence: `${refSurface}(${refHost})에서 ${target} 로 진입 — ${teamNote}`,
      cls: 'bg-slate-100 text-slate-700 border-slate-200',
    };
  }

  if (ref && refHost && !isNaverHost(refHost)) {
    return {
      label: '외부 유입',
      icon: '🌐',
      sentence: `${refHost} 에서 ${target} 로 진입`,
      cls: 'bg-violet-100 text-violet-700 border-violet-200',
    };
  }

  if (ref?.query) {
    const smInfo = ref.smCode ? SM_TABLE[ref.smCode] : undefined;
    const action = smInfo ? smInfo.label : '검색';
    return {
      label: '검색 유입',
      icon: '🔍',
      sentence: `네이버 검색에서 "${ref.query}" → ${action} → ${target} 로 진입`,
      cls: 'bg-accent/15 text-accent border-accent/30',
    };
  }

  if (isSearchPage(d.hostname || '') && d.query) {
    const smInfo = d.smCode ? SM_TABLE[d.smCode] : undefined;
    const action = smInfo ? smInfo.label : '검색';
    const sectionName = d.surface || '네이버 검색';
    const pageNote = d.pageNo && d.pageNo !== '1' ? ` · ${d.pageNo}페이지` : '';
    return {
      label: '검색 결과',
      icon: '🔍',
      sentence: `${sectionName}에서 "${d.query}"${smInfo ? ` ${action}` : ''} 결과 페이지${pageNote}`,
      cls: 'bg-accent/15 text-accent border-accent/30',
    };
  }

  if (d.directAccess) {
    return {
      label: '직접 접속',
      icon: '🔗',
      sentence: `${target} 로 직접 접속`,
      cls: 'bg-blue-100 text-blue-700 border-blue-200',
    };
  }

  if (refHost && isNaverHost(refHost)) {
    return {
      label: '내부 이동',
      icon: '📱',
      sentence: `${refHost} 에서 ${target} 로 이동`,
      cls: 'bg-emerald-100 text-emerald-700 border-emerald-200',
    };
  }

  return {
    label: '일반 접속',
    icon: '📄',
    sentence: target,
    cls: 'bg-gray-100 text-gray-700 border-gray-200',
  };
}

// ──────────────────────────────────────────────────────────
// 일괄 분석 집계
// ──────────────────────────────────────────────────────────

export interface BatchRow {
  raw: string;
  decoded: DecodedNaverUrl;
  intent: Intent;
  smCode?: string;
  query?: string;
}

export interface BatchAggregate {
  total: number;
  valid: number;
  invalid: number;
  intents: Array<{ label: string; icon: string; cls: string; count: number; ratio: number }>;
  sms: Array<{ code: string; label: string; strength: Strength; count: number; ratio: number }>;
  queries: Array<{ query: string; count: number; ratio: number }>;
  surfaces: Array<{ surface: string; count: number; ratio: number }>;
  rows: BatchRow[];
}

export function analyzeBatch(input: string): BatchAggregate {
  const lines = input
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  const rows: BatchRow[] = lines.map((raw) => {
    const decoded = decode(raw);
    const intent = summarize(decoded);
    return {
      raw,
      decoded,
      intent,
      smCode: decoded.topRefererDecoded?.smCode || decoded.smCode,
      query: decoded.topRefererDecoded?.query || decoded.query,
    };
  });

  const valid = rows.filter((r) => r.decoded.valid).length;
  const invalid = rows.length - valid;

  const intentMap = new Map<string, { icon: string; cls: string; count: number }>();
  const smMap = new Map<string, number>();
  const queryMap = new Map<string, number>();
  const surfaceMap = new Map<string, number>();

  for (const row of rows) {
    if (!row.decoded.valid) continue;
    const i = row.intent;
    const cur = intentMap.get(i.label) || { icon: i.icon, cls: i.cls, count: 0 };
    cur.count += 1;
    intentMap.set(i.label, cur);

    if (row.smCode) smMap.set(row.smCode, (smMap.get(row.smCode) || 0) + 1);
    if (row.query) queryMap.set(row.query, (queryMap.get(row.query) || 0) + 1);
    if (row.decoded.surface) surfaceMap.set(row.decoded.surface, (surfaceMap.get(row.decoded.surface) || 0) + 1);
  }

  const denom = Math.max(valid, 1);

  return {
    total: rows.length,
    valid,
    invalid,
    intents: Array.from(intentMap.entries())
      .map(([label, v]) => ({ label, icon: v.icon, cls: v.cls, count: v.count, ratio: v.count / denom }))
      .sort((a, b) => b.count - a.count),
    sms: Array.from(smMap.entries())
      .map(([code, count]) => ({
        code,
        label: SM_TABLE[code]?.label || '알 수 없음',
        strength: SM_TABLE[code]?.strength || 'unknown',
        count,
        ratio: count / denom,
      }))
      .sort((a, b) => b.count - a.count),
    queries: Array.from(queryMap.entries())
      .map(([query, count]) => ({ query, count, ratio: count / denom }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10),
    surfaces: Array.from(surfaceMap.entries())
      .map(([surface, count]) => ({ surface, count, ratio: count / denom }))
      .sort((a, b) => b.count - a.count),
    rows,
  };
}

// ──────────────────────────────────────────────────────────
// 예시 URL
// ──────────────────────────────────────────────────────────

export const EXAMPLES: Array<{ label: string; url: string }> = [
  {
    label: '검색기록 재방문 (top_hty)',
    url: 'https://blog.naver.com/prologue/PrologueList.naver?blogId=orangelibrary_&topReferer=https%3A%2F%2Fsearch.naver.com%2Fsearch.naver%3Fwhere%3Dnexearch%26sm%3Dtop_hty%26fbm%3D0%26ie%3Dutf8%26query%3D%25EC%2598%25A4%25EB%25A0%258C%25EC%25A7%2580%25EB%258F%2584%25EC%2584%259C%25EA%25B4%2580%26ackey%3D2g3yu6d4&trackingCode=nx&directAccess=true',
  },
  {
    label: '자동완성 클릭 (top_sug)',
    url: 'https://search.naver.com/search.naver?where=nexearch&sm=top_sug&query=%EB%A7%9E%EC%B6%A4%EB%B2%95%EA%B2%80%EC%82%AC%EA%B8%B0',
  },
  {
    label: '직접 입력 (top_hky)',
    url: 'https://search.naver.com/search.naver?where=nexearch&sm=top_hky&query=%EA%B8%80%EC%9E%90%EC%88%98%EC%84%B8%EA%B8%B0',
  },
];

export const BATCH_SAMPLE = `https://blog.naver.com/prologue/PrologueList.naver?blogId=orangelibrary_&topReferer=https%3A%2F%2Fsearch.naver.com%2Fsearch.naver%3Fwhere%3Dnexearch%26sm%3Dtop_hty%26query%3D%25EC%2598%25A4%25EB%25A0%258C%25EC%25A7%2580%25EB%258F%2584%25EC%2584%259C%25EA%25B4%2580&trackingCode=nx&directAccess=true
https://blog.naver.com/prologue/PrologueList.naver?blogId=orangelibrary_&topReferer=https%3A%2F%2Fsearch.naver.com%2Fsearch.naver%3Fwhere%3Dnexearch%26sm%3Dtop_sug%26query%3D%25EB%258F%2584%25EC%2584%259C%25EA%25B4%2580&trackingCode=nx&directAccess=true
https://blog.naver.com/PostView.naver?blogId=orangelibrary_&logNo=12345&topReferer=https%3A%2F%2Fsearch.naver.com%2Fsearch.naver%3Fwhere%3Dnexearch%26sm%3Dtop_hky%26query%3D%25EC%25B1%2585%25EC%25B6%2594%25EC%25B2%259C&trackingCode=nx&directAccess=true
https://blog.naver.com/orangelibrary_/12346?topReferer=https%3A%2F%2Fwww.instagram.com%2F`;
