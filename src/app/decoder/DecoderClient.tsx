'use client';

import { useEffect, useMemo, useState } from 'react';

/**
 * 네이버 URL 디코더 (클라이언트)
 *
 * 단건 / 일괄 두 가지 모드를 지원한다.
 * - 단건: referer · sm · trackingCode 한 줄 해석 + 상세 분석
 * - 일괄: 줄바꿈 구분 URL 목록 → 의도/sm/검색어 분포 리포트
 */

// ──────────────────────────────────────────────────────────
// 파라미터 매핑 테이블
// ──────────────────────────────────────────────────────────

type Strength = 'very-strong' | 'strong' | 'medium' | 'weak' | 'unknown';

const SM_TABLE: Record<string, { label: string; strength: Strength }> = {
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

const STRENGTH_META: Record<Strength, { label: string; short: string; cls: string }> = {
  'very-strong': { label: '매우 강 · 충성 방문 신호', short: '매우강', cls: 'text-emerald-700 bg-emerald-100 border border-emerald-200' },
  'strong': { label: '강 · 명확한 브랜드 인지', short: '강', cls: 'text-blue-700 bg-blue-100 border border-blue-200' },
  'medium': { label: '중 · 인지는 있음', short: '중', cls: 'text-amber-700 bg-amber-100 border border-amber-200' },
  'weak': { label: '약 · 수동적 발견', short: '약', cls: 'text-rose-700 bg-rose-100 border border-rose-200' },
  'unknown': { label: '분류 외', short: '?', cls: 'text-gray-700 bg-gray-100 border border-gray-200' },
};

const TRACKING_TABLE: Record<string, string> = {
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

const WHERE_TABLE: Record<string, string> = {
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

interface DecodedNaverUrl {
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

function decode(rawUrl: string, depth = 0): DecodedNaverUrl {
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

interface Intent {
  label: string;
  icon: string;
  sentence: string;
  cls: string;
}

function summarize(d: DecodedNaverUrl): Intent {
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

interface BatchRow {
  raw: string;
  decoded: DecodedNaverUrl;
  intent: Intent;
  smCode?: string;
  query?: string;
}

interface BatchAggregate {
  total: number;
  valid: number;
  invalid: number;
  intents: Array<{ label: string; icon: string; cls: string; count: number; ratio: number }>;
  sms: Array<{ code: string; label: string; strength: Strength; count: number; ratio: number }>;
  queries: Array<{ query: string; count: number; ratio: number }>;
  surfaces: Array<{ surface: string; count: number; ratio: number }>;
  rows: BatchRow[];
}

function analyzeBatch(input: string): BatchAggregate {
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

const EXAMPLES: Array<{ label: string; url: string }> = [
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

const BATCH_SAMPLE = `https://blog.naver.com/prologue/PrologueList.naver?blogId=orangelibrary_&topReferer=https%3A%2F%2Fsearch.naver.com%2Fsearch.naver%3Fwhere%3Dnexearch%26sm%3Dtop_hty%26query%3D%25EC%2598%25A4%25EB%25A0%258C%25EC%25A7%2580%25EB%258F%2584%25EC%2584%259C%25EA%25B4%2580&trackingCode=nx&directAccess=true
https://blog.naver.com/prologue/PrologueList.naver?blogId=orangelibrary_&topReferer=https%3A%2F%2Fsearch.naver.com%2Fsearch.naver%3Fwhere%3Dnexearch%26sm%3Dtop_sug%26query%3D%25EB%258F%2584%25EC%2584%259C%25EA%25B4%2580&trackingCode=nx&directAccess=true
https://blog.naver.com/PostView.naver?blogId=orangelibrary_&logNo=12345&topReferer=https%3A%2F%2Fsearch.naver.com%2Fsearch.naver%3Fwhere%3Dnexearch%26sm%3Dtop_hky%26query%3D%25EC%25B1%2585%25EC%25B6%2594%25EC%25B2%259C&trackingCode=nx&directAccess=true
https://blog.naver.com/orangelibrary_/12346?topReferer=https%3A%2F%2Fwww.instagram.com%2F`;

// ──────────────────────────────────────────────────────────
// 페이지 컴포넌트
// ──────────────────────────────────────────────────────────

type Mode = 'single' | 'batch';

interface DecoderClientProps {
  initialUrl?: string;
}

export default function DecoderClient({ initialUrl = '' }: DecoderClientProps) {
  const [mode, setMode] = useState<Mode>('single');
  const [input, setInput] = useState(initialUrl);
  const [batchInput, setBatchInput] = useState('');
  const [shareCopied, setShareCopied] = useState(false);

  // initialUrl이 있으면 단건 모드 자동 진입
  useEffect(() => {
    if (initialUrl) {
      setMode('single');
      setInput(initialUrl);
    }
  }, [initialUrl]);

  const decoded = useMemo(() => (input.trim() ? decode(input) : null), [input]);
  const intent = useMemo(() => (decoded ? summarize(decoded) : null), [decoded]);

  const ref = decoded?.topRefererDecoded;
  const refSmInfo = ref?.smCode ? SM_TABLE[ref.smCode] : undefined;
  const ownSmInfo = decoded?.smCode ? SM_TABLE[decoded.smCode] : undefined;
  const smInfo = refSmInfo || ownSmInfo;
  const smCode = ref?.smCode || decoded?.smCode;

  const batch = useMemo(() => (batchInput.trim() ? analyzeBatch(batchInput) : null), [batchInput]);

  const shareUrl = useMemo(() => {
    if (!input.trim() || typeof window === 'undefined') return '';
    const params = new URLSearchParams({ url: input });
    return `${window.location.origin}/decoder?${params.toString()}`;
  }, [input]);

  const handleShare = async () => {
    if (!shareUrl) return;
    try {
      await navigator.clipboard.writeText(shareUrl);
      setShareCopied(true);
      setTimeout(() => setShareCopied(false), 2000);
    } catch {}
  };

  return (
    <div className="space-y-8 max-w-4xl mx-auto">
      {/* 헤더 */}
      <div className="text-center pt-4">
        <p className="text-xs text-accent font-semibold tracking-widest mb-3">URL DECODER</p>
        <h1 className="font-title text-2xl md:text-3xl font-extrabold text-text mb-3">
          네이버 URL 디코더
        </h1>
        <p className="text-sm text-dim leading-relaxed">
          블로그 통계의 알 수 없는 referer URL을 붙여넣으면<br className="md:hidden" />
          어떤 검색에서, 어떤 방식으로 들어왔는지 한 줄로 해석해 드립니다.
        </p>
      </div>

      {/* 모드 탭 */}
      <div className="flex gap-2 justify-center">
        {(
          [
            { key: 'single', label: '단건 분석', desc: 'URL 1개' },
            { key: 'batch', label: '일괄 분석', desc: '여러 개 통계' },
          ] as Array<{ key: Mode; label: string; desc: string }>
        ).map((tab) => {
          const active = mode === tab.key;
          return (
            <button
              key={tab.key}
              type="button"
              onClick={() => setMode(tab.key)}
              className={`px-4 py-2 rounded-full text-sm font-semibold transition border ${
                active
                  ? 'bg-accent text-white border-accent'
                  : 'bg-surface text-text border-border hover:border-accent/60'
              }`}
            >
              {tab.label}
              <span className={`ml-2 text-[10px] ${active ? 'text-white/80' : 'text-dim'}`}>
                {tab.desc}
              </span>
            </button>
          );
        })}
      </div>

      {/* 단건 모드 */}
      {mode === 'single' && (
        <>
          <div className="bg-surface rounded-2xl border border-border p-5 space-y-3">
            <label className="block text-xs font-semibold text-dim">분석할 URL</label>
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              rows={3}
              placeholder="https://blog.naver.com/... 또는 https://search.naver.com/... 형태의 URL을 붙여넣으세요"
              className="w-full px-3 py-2.5 text-sm font-mono bg-bg border border-border rounded-xl focus:outline-none focus:border-accent/60 resize-none break-all"
            />

            <div className="flex flex-wrap gap-2 pt-1 items-center">
              <span className="text-[11px] text-dim">예시:</span>
              {EXAMPLES.map((ex) => (
                <button
                  key={ex.label}
                  type="button"
                  onClick={() => setInput(ex.url)}
                  className="text-[11px] px-2.5 py-1 rounded-full bg-bg border border-border text-dim hover:border-accent/60 hover:text-accent transition"
                >
                  {ex.label}
                </button>
              ))}
              {input && (
                <div className="flex gap-2 ml-auto">
                  <button
                    type="button"
                    onClick={handleShare}
                    className="text-[11px] px-2.5 py-1 rounded-full bg-accent/10 border border-accent/20 text-accent hover:bg-accent hover:text-white transition"
                  >
                    {shareCopied ? '✓ 복사됨' : '🔗 분석 링크 복사'}
                  </button>
                  <button
                    type="button"
                    onClick={() => setInput('')}
                    className="text-[11px] px-2.5 py-1 rounded-full bg-bg border border-border text-dim hover:text-rose-600 transition"
                  >
                    지우기
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* 결과 */}
          {decoded && (
            <div className="space-y-5">
              {intent && (
                <div className="bg-surface rounded-2xl border border-border p-6 space-y-4">
                  <div className="flex flex-wrap items-center gap-3">
                    <span className={`inline-flex items-center gap-1.5 text-sm font-bold px-3 py-1.5 rounded-full border ${intent.cls}`}>
                      <span className="text-base">{intent.icon}</span>
                      {intent.label}
                    </span>
                    {smInfo && (
                      <span className={`text-[11px] font-semibold px-2 py-1 rounded-full ${STRENGTH_META[smInfo.strength].cls}`}>
                        {STRENGTH_META[smInfo.strength].label}
                      </span>
                    )}
                  </div>
                  <p className="text-base text-text leading-relaxed font-medium">
                    {intent.sentence}
                  </p>
                  {!decoded.valid && decoded.error && (
                    <p className="text-xs text-rose-600">⚠️ {decoded.error}</p>
                  )}
                </div>
              )}

              {decoded.valid && (
                <div className="bg-surface rounded-2xl border border-border overflow-hidden">
                  <div className="px-5 py-3 border-b border-border/50 bg-bg/30">
                    <h2 className="text-sm font-bold text-text">상세 분석</h2>
                  </div>

                  <div className="divide-y divide-border/50">
                    <Section title="진입 페이지">
                      <Field label="화면" value={decoded.surface} />
                      <Field label="도메인" value={decoded.hostname} mono />
                      <Field label="경로" value={decoded.pathname} mono />
                      {decoded.blogId && <Field label="블로그 ID" value={decoded.blogId} mono />}
                      {decoded.logNo && <Field label="포스트 번호 (logNo)" value={decoded.logNo} mono />}
                      {decoded.directoryNo !== undefined && (
                        <Field
                          label="카테고리 (directoryNo)"
                          value={`${decoded.directoryNo}${decoded.directoryNo === '0' ? ' · 전체' : ''}`}
                        />
                      )}
                      {decoded.groupId !== undefined && (
                        <Field
                          label="그룹 (groupId)"
                          value={`${decoded.groupId}${decoded.groupId === '0' ? ' · 전체' : ''}`}
                        />
                      )}
                      {decoded.pageNo && !ref?.query && !decoded.query && (
                        <Field label="페이지" value={`${decoded.pageNo}페이지`} />
                      )}
                      {decoded.directAccess && (
                        <Field label="directAccess" value="true (검색 결과 블로그 영역에서 직접 클릭)" />
                      )}
                      {decoded.trackingCode && (
                        <Field
                          label="trackingCode"
                          value={`${decoded.trackingCode} ${TRACKING_TABLE[decoded.trackingCode] ? `· ${TRACKING_TABLE[decoded.trackingCode]}` : ''}`}
                        />
                      )}
                    </Section>

                    {(ref?.query || decoded.query) && (
                      <Section title="검색 정보">
                        <Field
                          label={`검색어${(ref?.queryParam || decoded.queryParam) && (ref?.queryParam || decoded.queryParam) !== 'query' ? ` (${ref?.queryParam || decoded.queryParam} 파라미터)` : ''}`}
                          value={ref?.query || decoded.query}
                          highlight
                        />
                        {(ref?.where || decoded.where) && (
                          <Field
                            label="where"
                            value={`${ref?.where || decoded.where} ${WHERE_TABLE[ref?.where || decoded.where || ''] ? `· ${WHERE_TABLE[ref?.where || decoded.where || '']}` : ''}`}
                          />
                        )}
                        {smCode && (
                          <Field
                            label="sm 코드"
                            value={`${smCode} ${smInfo ? `· ${smInfo.label}` : '· 알 수 없음'}`}
                          />
                        )}
                        {(ref?.pageNo || decoded.pageNo) && (
                          <Field label="페이지" value={`${ref?.pageNo || decoded.pageNo}페이지`} />
                        )}
                        {(ref?.orderBy || decoded.orderBy) && (
                          <Field label="정렬" value={ref?.orderBy || decoded.orderBy} />
                        )}
                        {(ref?.range || decoded.range) && (
                          <Field label="기간" value={ref?.range || decoded.range} />
                        )}
                        {(ref?.ackey || decoded.ackey) && (
                          <Field label="ackey" value={`${ref?.ackey || decoded.ackey} (검색 세션 식별자)`} mono />
                        )}
                      </Section>
                    )}

                    {decoded.topReferer && ref && (
                      <Section title="topReferer (이전 페이지)">
                        <Field label="화면" value={ref.surface} />
                        <Field label="도메인" value={ref.hostname} mono />
                        <details className="text-xs">
                          <summary className="cursor-pointer text-dim hover:text-accent">
                            디코딩된 원본 URL
                          </summary>
                          <p className="mt-2 p-2 bg-bg rounded text-[11px] font-mono break-all text-dim">
                            {ref.raw}
                          </p>
                        </details>
                      </Section>
                    )}

                    <Section title="원본 파라미터">
                      <details>
                        <summary className="text-xs text-dim hover:text-accent cursor-pointer">
                          모든 쿼리 파라미터 보기 ({decoded.rawParams.length}개)
                        </summary>
                        <div className="mt-3 space-y-1.5">
                          {decoded.rawParams.map((p, i) => (
                            <div key={i} className="flex gap-2 text-[11px] font-mono">
                              <span className="text-accent shrink-0 min-w-[110px]">{p.key}</span>
                              <span className="text-text break-all">{p.value}</span>
                            </div>
                          ))}
                        </div>
                      </details>
                    </Section>
                  </div>
                </div>
              )}
            </div>
          )}
        </>
      )}

      {/* 일괄 모드 */}
      {mode === 'batch' && (
        <>
          <div className="bg-surface rounded-2xl border border-border p-5 space-y-3">
            <div className="flex items-baseline justify-between">
              <label className="block text-xs font-semibold text-dim">
                URL 목록 (한 줄에 하나씩)
              </label>
              <button
                type="button"
                onClick={() => setBatchInput(BATCH_SAMPLE)}
                className="text-[11px] px-2.5 py-1 rounded-full bg-bg border border-border text-dim hover:border-accent/60 hover:text-accent transition"
              >
                샘플 데이터로 채우기
              </button>
            </div>
            <textarea
              value={batchInput}
              onChange={(e) => setBatchInput(e.target.value)}
              rows={10}
              placeholder={`네이버 블로그 통계의 referer URL을 한 줄에 하나씩 붙여넣으세요.\n\nhttps://blog.naver.com/...\nhttps://blog.naver.com/...\nhttps://search.naver.com/...`}
              className="w-full px-3 py-2.5 text-xs font-mono bg-bg border border-border rounded-xl focus:outline-none focus:border-accent/60 resize-y break-all"
            />
            {batchInput && (
              <div className="flex justify-end">
                <button
                  type="button"
                  onClick={() => setBatchInput('')}
                  className="text-[11px] px-2.5 py-1 rounded-full bg-bg border border-border text-dim hover:text-rose-600 transition"
                >
                  지우기
                </button>
              </div>
            )}
          </div>

          {batch && batch.total > 0 && (
            <div className="space-y-5">
              {/* 요약 헤더 */}
              <div className="bg-surface rounded-2xl border border-border p-5 flex flex-wrap gap-4 items-center">
                <div>
                  <p className="text-xs text-dim">총 URL</p>
                  <p className="text-2xl font-extrabold text-text">{batch.total}</p>
                </div>
                <div>
                  <p className="text-xs text-dim">분석 성공</p>
                  <p className="text-2xl font-extrabold text-emerald-600">{batch.valid}</p>
                </div>
                {batch.invalid > 0 && (
                  <div>
                    <p className="text-xs text-dim">실패</p>
                    <p className="text-2xl font-extrabold text-rose-600">{batch.invalid}</p>
                  </div>
                )}
              </div>

              {/* 의도별 분포 */}
              <DistroCard
                title="📊 의도별 분포"
                items={batch.intents.map((i) => ({
                  key: i.label,
                  left: (
                    <span className={`inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded border ${i.cls}`}>
                      {i.icon} {i.label}
                    </span>
                  ),
                  count: i.count,
                  ratio: i.ratio,
                }))}
              />

              {/* sm 코드별 분포 */}
              {batch.sms.length > 0 && (
                <DistroCard
                  title="🔑 sm 코드 분포 (브랜드 강도)"
                  items={batch.sms.map((s) => ({
                    key: s.code,
                    left: (
                      <span className="flex items-center gap-2">
                        <code className="font-mono text-xs text-accent">{s.code}</code>
                        <span className="text-xs text-text">{s.label}</span>
                        <span className={`text-[10px] px-1.5 py-0.5 rounded ${STRENGTH_META[s.strength].cls}`}>
                          {STRENGTH_META[s.strength].short}
                        </span>
                      </span>
                    ),
                    count: s.count,
                    ratio: s.ratio,
                  }))}
                />
              )}

              {/* 검색어 TOP */}
              {batch.queries.length > 0 && (
                <DistroCard
                  title={`🔍 검색어 TOP ${batch.queries.length}`}
                  items={batch.queries.map((q) => ({
                    key: q.query,
                    left: <span className="text-sm font-semibold text-text">{q.query}</span>,
                    count: q.count,
                    ratio: q.ratio,
                  }))}
                />
              )}

              {/* 화면별 분포 */}
              {batch.surfaces.length > 0 && (
                <DistroCard
                  title="📄 진입 화면 분포"
                  items={batch.surfaces.map((s) => ({
                    key: s.surface,
                    left: <span className="text-sm text-text">{s.surface}</span>,
                    count: s.count,
                    ratio: s.ratio,
                  }))}
                />
              )}

              {/* 전체 목록 */}
              <details className="bg-surface rounded-2xl border border-border">
                <summary className="px-5 py-3 cursor-pointer text-sm font-bold text-text hover:bg-bg/30">
                  📋 전체 목록 ({batch.rows.length}개)
                </summary>
                <div className="border-t border-border/50 divide-y divide-border/30 max-h-96 overflow-y-auto">
                  {batch.rows.map((row, i) => (
                    <div key={i} className="px-5 py-3 text-xs space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-mono text-dim shrink-0">#{i + 1}</span>
                        <span className={`inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded border ${row.intent.cls}`}>
                          {row.intent.icon} {row.intent.label}
                        </span>
                        {row.smCode && (
                          <code className="text-[10px] font-mono text-accent">{row.smCode}</code>
                        )}
                        {row.query && (
                          <span className="text-[11px] text-text font-semibold">"{row.query}"</span>
                        )}
                      </div>
                      <p className="text-[10px] font-mono text-dim break-all line-clamp-2">{row.raw}</p>
                    </div>
                  ))}
                </div>
              </details>
            </div>
          )}
        </>
      )}

      {/* 도움말 */}
      <div className="bg-surface rounded-2xl border border-border p-6 space-y-4">
        <h2 className="text-sm font-bold text-text flex items-center gap-2">
          <span>💡</span> sm 코드로 보는 브랜드 강도
        </h2>
        <p className="text-xs text-dim leading-relaxed">
          네이버 검색창에 들어온 방식(<code className="text-accent">sm</code> 파라미터)은 사용자의 인지 강도를 보여주는 중요한 신호입니다.
          같은 검색어라도 <strong className="text-text">검색기록(top_hty)</strong>에서 들어온 비율이 높다면 충성도 높은 재방문자가 많다는 뜻입니다.
        </p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
          {Object.entries(SM_TABLE)
            .filter(([k]) => !k.startsWith('mtp_') && !k.startsWith('tab_'))
            .map(([code, info]) => (
              <div key={code} className="flex items-start gap-2 text-xs">
                <code className="font-mono text-accent shrink-0 min-w-[68px]">{code}</code>
                <span className="text-text">{info.label}</span>
                <span className={`ml-auto shrink-0 text-[10px] px-1.5 py-0.5 rounded ${STRENGTH_META[info.strength].cls}`}>
                  {STRENGTH_META[info.strength].short}
                </span>
              </div>
            ))}
        </div>
      </div>

      {/* 하단 CTA */}
      <div className="text-center pb-4">
        <p className="text-xs text-dim leading-relaxed">
          이 도구는 무료입니다. 키워드별 유입 패턴까지 한눈에 보고 싶다면<br />
          <a href="/subscribe" className="text-accent hover:underline font-semibold">
            네이버 인플루언서 키워드챌린지 대시보드
          </a>
          를 확인해 보세요.
        </p>
      </div>
    </div>
  );
}

// ──────────────────────────────────────────────────────────
// 작은 표시 컴포넌트
// ──────────────────────────────────────────────────────────

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="px-5 py-4 space-y-2">
      <h3 className="text-[11px] font-bold text-dim uppercase tracking-wider">{title}</h3>
      <div className="space-y-1.5">{children}</div>
    </div>
  );
}

function Field({
  label,
  value,
  mono,
  highlight,
}: {
  label: string;
  value?: string | null;
  mono?: boolean;
  highlight?: boolean;
}) {
  if (!value) return null;
  return (
    <div className="flex flex-col sm:flex-row sm:items-baseline gap-1 sm:gap-3 text-sm">
      <span className="text-xs text-dim shrink-0 sm:min-w-[100px]">{label}</span>
      <span
        className={`break-all ${mono ? 'font-mono text-xs' : ''} ${
          highlight ? 'text-accent font-bold' : 'text-text'
        }`}
      >
        {value}
      </span>
    </div>
  );
}

function DistroCard({
  title,
  items,
}: {
  title: string;
  items: Array<{ key: string; left: React.ReactNode; count: number; ratio: number }>;
}) {
  if (items.length === 0) return null;
  const max = Math.max(...items.map((i) => i.ratio), 0.0001);
  return (
    <div className="bg-surface rounded-2xl border border-border p-5 space-y-3">
      <h3 className="text-sm font-bold text-text">{title}</h3>
      <div className="space-y-2">
        {items.map((item) => (
          <div key={item.key} className="space-y-1">
            <div className="flex items-baseline justify-between gap-3">
              <div className="min-w-0 flex-1">{item.left}</div>
              <span className="text-xs text-dim shrink-0 font-mono">
                {item.count}건 · {(item.ratio * 100).toFixed(0)}%
              </span>
            </div>
            <div className="h-1.5 bg-bg rounded-full overflow-hidden">
              <div
                className="h-full bg-accent rounded-full transition-all"
                style={{ width: `${(item.ratio / max) * 100}%` }}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
