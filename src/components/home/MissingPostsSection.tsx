'use client';

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import GlassCard from '@/components/dashboard/GlassCard';
import Modal from '@/components/ui/Modal';
import PageHeader from '@/components/analytics/PageHeader';
import SummaryCards, { type SummaryCard } from '@/components/analytics/SummaryCards';
import PeriodFilter, { PERIOD_OPTIONS } from '@/components/analytics/PeriodFilter';
import SegmentedFilter from '@/components/analytics/SegmentedFilter';
import PostSearchBar, { selectClass } from '@/components/analytics/PostSearchBar';
import AnalyticsTableShell from '@/components/analytics/AnalyticsTableShell';
import { countIndexingWait, displayVerdict, classifyExposure, countByExposureClass, INDEXING_GRACE_HOURS, type MissingResultsMap, type MissingState, type MissingArea, type ExposureClass, type PostLike } from '@/lib/missing-rate';
import { verdictLabel, confidenceLabel, type ExposureVerdict } from '@/lib/exposure-verdict';
import { parseNaverPostDate } from '@/lib/naver-date';
import type { BloggerProfile, BlogPost } from './BlogAnalysisSection.helpers';
import { fetchWithTimeout, getProfileFromApi, CHECK_FRESH_MS } from './BlogAnalysisSection.helpers';
import { newViewToken, viewHeaders, readQuotaExceeded, type QuotaInfo } from '@/lib/analysis-view';
import AnalysisQuotaNotice from '@/components/AnalysisQuotaNotice';
import { estimateEta } from '@/components/analytics/CheckProgress';
import { useAuth } from '@/hooks/useAuth';
import { useMemberOnlyGate } from '@/contexts/MemberOnlyGateContext';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { MISSING_POSTS_TEASER, MISSING_POSTS_RECENT_LIMIT, SUBSCRIBE_PATH, planLabel, requiredPlanFor, type PlanKey } from '@/lib/plans';
import { rowsToCsv, downloadCsvInBrowser, todayStamp } from '@/lib/csv';

// §1·§12·§19 최근 N일까지는 기본(무료) 조회, 초과는 회원 전용. 서버(exposure-policy.ts)가 과금·권한을 최종 강제하며
// 여기 값은 UI 게이팅용(동일 기본값 30). 서버와 어긋나도 서버가 최종 판단하므로 안전.
const FREE_DAYS = 30;
// 확장(회원 전용): 기간이 '전체(0)'이거나 FREE_DAYS 초과면 30일 이전 조회 → 회원 전용 + 크레딧 정책 대상.
function isExtendedPeriod(n: Period): boolean { return n === 0 || n > FREE_DAYS; }

type Period = typeof PERIOD_OPTIONS[number]; // 0 = 전체(일수 기준 아님)
/**
 * 전체 포스팅 목록 조회의 클라이언트 타임아웃.
 *
 * fetchWithTimeout 의 기본값은 10초인데, /api/blog/posts?all=true 는 네이버를 여러 페이지
 * 순차 크롤링하므로 서버가 스스로 `maxDuration = 60` 을 잡아둔다. 즉 캐시가 비어 있으면
 * 서버가 정상 동작하는 중에도 클라이언트가 10초에 먼저 포기했고, 그 결과 화면 전체가
 * "전부 0"으로 그려졌다(940글 블로그에서 첫 진입마다 재현). 서버 예산에 맞춘다.
 */
const ALL_POSTS_TIMEOUT_MS = 60_000;
const DAY_MS = 24 * 60 * 60 * 1000;
// 페이지 진입 시 최근 발행글을 자동 검사하는 개수 — 최신 상태를 자동 갱신하되 대량 호출은 피한다.
// 이미 최근(CHECK_FRESH_MS 내) 검사된 글은 runBatch가 건너뛰므로 실제 호출은 이보다 적다.
const AUTO_CHECK_LIMIT = 30;

type SortKey = 'latest' | 'oldest' | 'title' | 'missingRate';
type AreaFilter = 'all' | MissingArea;
// §3 빠른 상태 필터 — 전체/노출(정상)/미노출/일부 노출/미확인
type StatusFilter = 'all' | 'normal' | 'partial' | 'missing' | 'unchecked';
const STATUS_FILTERS: { key: StatusFilter; label: string }[] = [
  { key: 'all', label: '전체' },
  { key: 'normal', label: '노출' },
  { key: 'missing', label: '미노출' },
  { key: 'partial', label: '일부 노출' },
  { key: 'unchecked', label: '미확인' },
];

/**
 * 상단 요약 카드 ↔ 상태 필터 대응. 카드 키와 필터 키가 두 군데(전체/미확인)에서 어긋나 있어
 * 표로 고정해 둔다 — 한쪽 이름만 고치면 클릭이 조용히 엉뚱한 필터를 걸게 된다.
 */
const FILTER_BY_CARD: Record<string, StatusFilter> = {
  total: 'all', normal: 'normal', missing: 'missing', partial: 'partial', unknown: 'unchecked',
};
const CARD_TO_FILTER_KEY: Record<StatusFilter, string> = {
  all: 'total', normal: 'normal', missing: 'missing', partial: 'partial', unchecked: 'unknown',
};

// 영역·정렬 선택지를 표로 빼 둔다 — 드롭다운과 아래 '적용된 필터' 칩이 같은 라벨을 써야
// 고른 것과 표시되는 것이 어긋나지 않는다.
const AREA_FILTERS: { key: AreaFilter; label: string; chip: string }[] = [
  { key: 'all', label: '노출 영역: 전체', chip: '' },
  { key: 'view', label: '통합검색 미노출만', chip: '통합검색 미노출만' },
  { key: 'blog', label: '블로그 미노출만', chip: '블로그 미노출만' },
  { key: 'influencer', label: '인플루언서 미노출만', chip: '인플루언서 미노출만' },
];
const SORT_OPTIONS: { key: SortKey; label: string }[] = [
  { key: 'latest', label: '최신순' },
  { key: 'oldest', label: '오래된순' },
  { key: 'title', label: '제목순' },
  { key: 'missingRate', label: '미노출률순' },
];

/** 필터 기본값 — 주소창에는 기본값과 다른 것만 남긴다(공유한 링크가 읽히게). */
const DEFAULT_PERIOD = 30;

/**
 * 포스팅 수집이 빈손으로 끝난 이유.
 * 앞의 셋은 서버(/api/blog/posts)가 code 로 내려주고, 뒤의 둘은 브라우저에서만 알 수 있다.
 * BLOG_NOT_LINKED 는 여기 없다 — 수집을 시도조차 안 한 상태라 별도 화면 분기가 이미 있다.
 */
type CollectCode = 'NO_POSTS' | 'RATE_LIMITED' | 'UPSTREAM_ERROR' | 'TIMEOUT' | 'NETWORK';

/**
 * 이유별 안내. 사용자가 "그래서 내가 뭘 하면 되나"에 답할 수 있어야 한다.
 * retry=true 면 다시 시도 버튼을 붙인다(기다려서 될 일인 경우에만).
 * 🚨 UPSTREAM_ERROR 에서 "비공개 블로그입니다"라고 단정하지 않는다 — 네이버는 비공개·삭제·
 * 일시 장애를 구분해 주지 않으므로 단정하면 멀쩡한 블로그 주인에게 거짓말이 된다.
 */
const COLLECT_FAIL_COPY: Record<CollectCode, { title: string; detail: string; retry: boolean }> = {
  NO_POSTS: {
    title: '수집된 공개 글이 없습니다.',
    detail: '네이버는 정상 응답했지만 목록이 비어 있습니다. 발행한 글이 모두 비공개거나, 연결된 블로그 주소가 실제 사용 중인 블로그와 다를 수 있습니다.',
    retry: true,
  },
  RATE_LIMITED: {
    title: '네이버가 일시적으로 요청을 제한했습니다.',
    detail: '짧은 시간에 조회가 몰리면 네이버가 응답을 막습니다. 잠시 뒤 다시 시도하면 정상적으로 수집됩니다.',
    retry: true,
  },
  UPSTREAM_ERROR: {
    title: '네이버에서 포스팅 목록을 가져오지 못했습니다.',
    detail: '블로그가 비공개로 바뀌었거나, 네이버가 일시적으로 응답하지 않을 때 발생합니다. 블로그가 정상이라면 잠시 뒤 다시 시도해 주세요.',
    retry: true,
  },
  TIMEOUT: {
    title: '포스팅 목록을 불러오는 데 시간이 너무 오래 걸립니다.',
    detail: '글이 많은 블로그는 첫 조회에 1분 가까이 걸릴 수 있습니다. 한 번 수집되면 이후에는 빠릅니다.',
    retry: true,
  },
  NETWORK: {
    title: '포스팅 목록을 불러오지 못했습니다.',
    detail: '네트워크 연결 상태를 확인한 뒤 다시 시도해 주세요.',
    retry: true,
  },
};

/** 자동 재수집 크론(crawl-post-exposure) 시각 — vercel.json "0 1 * * *" UTC = KST 10:00. */
const AUTO_RECHECK_KST_HOUR = 10;

type PostMissingEntry = MissingState;

// /api/blog/exposure-extend/plan 응답 (§4·§5·§6)
type ExtendPlan = {
  creditsEnabled: boolean;
  freeLimit: number;
  totalCandidates: number;
  cached: number;
  newChecks: number;
  chargeable: number;
  unit: number;
  estCredits: number;
  balance: number;
};

// §7 노출↔미노출 전환 이력 (API /my/post-missing-history 응답)
type HistoryEntry = {
  prevState: 'exposed' | 'missing';
  newState: 'exposed' | 'missing';
  changedReason?: string | null;
  changedAt: string;
};

/** 절대 날짜 + 네이버 상대 시간("22시간 전"·"어제"·"3일 전") + ISO 까지 파싱 (공용 파서 위임, number→Date) */
function parsePostDate(raw?: string | null): Date | null {
  const t = parseNaverPostDate(raw);
  return t == null ? null : new Date(t);
}

function formatCheckedAt(iso?: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function missingAreaCount(mr?: PostMissingEntry): number {
  if (!mr) return 0;
  let n = 0;
  if (mr.viewTab.exposed === false) n++;
  if (mr.blogTab.exposed === false) n++;
  if (mr.influencerTab?.exposed === false) n++;
  return n;
}

/** 미노출 원인 추정 — 검사 결과를 바탕으로 사용자에게 보여줄 설명 문구 생성(휴리스틱, 확정 진단 아님) */
function buildCauseAnalysis(mr?: PostMissingEntry): string[] {
  const notes: string[] = [];
  if (!mr) {
    notes.push('아직 검사하지 않은 게시글입니다. "검사" 버튼을 눌러 노출 여부를 먼저 확인하세요.');
    return notes;
  }
  if (mr.status === 'unanalyzable') {
    notes.push('이 게시글은 검색 노출 분석 대상이 아닙니다(비공개 글이거나 검색어를 만들 수 없는 제목). 미노출로 집계되지 않습니다.');
    return notes;
  }
  if (mr.status === 'error') {
    notes.push('직전 검사에서 네이버 검색 결과를 불러오지 못했습니다(일시적 오류). 이 경우 미노출로 처리하지 않으며, 잠시 후 재검사하면 정상 확인될 수 있습니다.');
    return notes;
  }
  if (mr.status === 'failed') {
    notes.push('직전 검사가 실패했습니다(네트워크·타임아웃 가능성). 재검사를 시도해보세요.');
  }
  const areas = [
    { label: '통합검색', exposed: mr.viewTab.exposed },
    { label: '블로그탭', exposed: mr.blogTab.exposed },
    { label: '인플루언서탭', exposed: mr.influencerTab?.exposed ?? null },
  ];
  const checkedAreas = areas.filter(a => a.exposed !== null);
  const missingAreas = areas.filter(a => a.exposed === false);
  const exposedAreas = areas.filter(a => a.exposed === true);
  if (missingAreas.length > 0 && missingAreas.length === checkedAreas.length) {
    notes.push(`검사한 모든 영역(${missingAreas.map(a => a.label).join(', ')})에서 노출이 확인되지 않았습니다. 제목 경쟁이 심하거나, 검색 결과 상위 30위 안에 들지 못했을 가능성이 있습니다.`);
  } else if (missingAreas.length > 0 && exposedAreas.length > 0) {
    notes.push(`${exposedAreas.map(a => a.label).join(', ')}에서는 노출되지만 ${missingAreas.map(a => a.label).join(', ')}에서는 확인되지 않았습니다. 탭별 검색 알고리즘 차이로 인한 결과일 수 있습니다.`);
  }
  if (missingAreas.length > 0 && mr.candidates && mr.candidates.length > 0) {
    notes.push(`검사에 사용한 검색어: "${mr.candidates.join('", "')}" (포스팅 제목 기반). 실제 색인 반영이 늦어졌을 수 있으니 아래 "재검사" 버튼으로 다시 확인해보세요.`);
  }
  // 대표 키워드를 확정하지 못한 글은 "왜 이 검색어로 검사했는지"를 먼저 설명해야 한다.
  // 이 안내가 없으면 사용자는 파편 같은 검색어를 보고 검사 자체를 불신하게 된다.
  if (mr.evidence?.keywordUncertain) {
    notes.push('이 게시글은 제목에서 대표 키워드를 확정하지 못했습니다(자동 추출 확신도 낮음). 그래서 대표 키워드 대신 제목 기반 검색어를 우선으로 검사했습니다. 실제로 노리는 키워드가 따로 있다면 대표 키워드를 직접 지정한 뒤 재검사하면 정확도가 올라갑니다.');
  }
  if (missingAreas.length > 0 && (mr.searchVolume == null || mr.searchVolume === 0)) {
    notes.push('해당 검색어의 월간 검색량 데이터가 없습니다. 검색량이 매우 낮으면 순위 확인이 불안정할 수 있습니다.');
  }
  if (notes.length === 0) notes.push('현재 노출 상태가 양호합니다.');
  return notes;
}

// §4 게시글별 채널 노출 상태 배지 — 노출/미노출 + null 은 종합 상태(class)에 따라 확인중/확인실패/분석불가/미확인으로 구분.
// null 을 무조건 '미노출'로 표기하지 않는다(§4·§5).
function ExposureBadge({ exposed, post, mr, now = 0, area }: { exposed: boolean | null | undefined; post?: PostLike; mr?: PostMissingEntry; now?: number; area?: 'view' | 'blog' | 'influencer' }) {
  if (exposed === true) return <span title="이 영역 검색 결과에서 내 포스팅 URL을 찾았습니다." className="text-[11px] font-bold text-up bg-up/10 px-2 py-0.5 rounded-full whitespace-nowrap cursor-help">🟢 노출</span>;
  if (exposed === false) return <span title="이 영역 검색 결과를 정상적으로 읽었지만 내 포스팅이 없었습니다." className="text-[11px] font-bold text-down bg-down/10 px-2 py-0.5 rounded-full whitespace-nowrap cursor-help">🔴 미노출</span>;
  // exposed == null — 이 게시글의 종합 상태로 null 셀의 의미를 구분(확인중/확인실패/분석불가/확인불가/미확인).
  // post 가 있을 땐 호출측이 now 도 함께 넘긴다(목록 행). post 없는 상세 모달 셀은 'unchecked'로 처리.
  const c = post ? classifyExposure(post, mr, now) : 'unchecked';
  if (c === 'error') return <span title={CLASS_META.error.desc} className="text-[11px] font-semibold text-dim bg-border/40 px-2 py-0.5 rounded-full whitespace-nowrap cursor-help">⚫ 확인실패</span>;
  if (c === 'checking') return <span title={CLASS_META.checking.desc} className="text-[11px] font-semibold text-blue bg-blue/10 px-2 py-0.5 rounded-full whitespace-nowrap cursor-help">⚪ 확인중</span>;
  if (c === 'unanalyzable') return <span title={CLASS_META.unanalyzable.desc} className="text-[11px] font-semibold text-dim bg-border/40 px-2 py-0.5 rounded-full whitespace-nowrap cursor-help">⚫ 분석불가</span>;
  // 이 글은 검사를 마쳤는데(mr 존재) 이 영역만 결과가 없다 = 조회는 했지만 한 건도 읽지 못함 → '확인 불가'.
  // 아직 검사하지 않아서 비어 있는 '미확인'과 구분한다(§4 상태 구분). 미노출과는 무관하며 집계에도 들어가지 않는다.
  // 인플루언서탭은 등록 키워드가 없으면 애초에 조회 대상이 아니라 null 이므로 '확인 불가'라고 말하지 않는다.
  if (mr && area && area !== 'influencer') {
    return <span title="네이버 검색 결과를 한 건도 읽지 못해 이 영역은 판정에서 제외했습니다(미노출 아님)."
      className="text-[11px] font-semibold text-dim bg-border/40 px-2 py-0.5 rounded-full whitespace-nowrap cursor-help">◐ 확인 불가</span>;
  }
  return <span title={CLASS_META.unchecked.desc} className="text-[11px] font-semibold text-dim bg-border/30 px-2 py-0.5 rounded-full whitespace-nowrap cursor-help">미확인</span>;
}

// §5 종합 상태(class) 표기 메타 — 정상/일부 노출/미노출/확인 중/확인 실패/분석 불가/미확인.
// 확인 실패·분석 불가·확인 중·미확인은 절대 미노출로 표기하지 않는다(§5). 'missing' 은 isPostMissing 과 동일 기준(§12).
// desc 는 뱃지 툴팁. 판정 기준 설명이 접혀 있어도 뱃지 위에서 바로 뜻을 알 수 있어야 한다 —
// 특히 '확인 실패'·'분석 불가'·'미확인'은 겉보기가 비슷해 미노출로 오해하기 쉽다.
const CLASS_META: Record<ExposureClass, { emoji: string; text: string; cls: string; desc: string }> = {
  normal:       { emoji: '🟢', text: '정상',      cls: 'text-up bg-up/10',            desc: '검사한 영역에서 모두 노출이 확인됐습니다.' },
  partial:      { emoji: '🟡', text: '일부 노출', cls: 'text-amber-600 bg-amber-500/15', desc: '일부 영역에서만 노출됩니다. 노출되지 않은 영역은 상세에서 확인할 수 있습니다.' },
  missing:      { emoji: '🔴', text: '미노출',    cls: 'text-down bg-down/10',        desc: '확인에 성공한 영역 전부에서 찾지 못했고, 2차 재검증까지 통과한 확정 판정입니다.' },
  checking:     { emoji: '⚪', text: '확인 중',   cls: 'text-blue bg-blue/10',        desc: `발행 후 ${INDEXING_GRACE_HOURS}시간 이내라 네이버 색인을 기다리는 중입니다. 미노출 집계에서 제외됩니다.` },
  error:        { emoji: '⚫', text: '확인 실패', cls: 'text-dim bg-border/40',       desc: '검사 요청이 실패했습니다. 미노출이라는 뜻이 아니며, 다시 검사하면 판정됩니다.' },
  unanalyzable: { emoji: '⚫', text: '분석 불가', cls: 'text-dim bg-border/40',       desc: '비공개 글이라 검색 노출 대상이 아닙니다.' },
  unchecked:    { emoji: '⚪', text: '미확인',    cls: 'text-dim bg-border/30',       desc: '아직 검사하지 않았습니다. 미노출이라는 뜻이 아닙니다.' },
};

function StatusBadge({ post, mr, isChecking, now }: { post: PostLike; mr?: PostMissingEntry; isChecking: boolean; now: number }) {
  if (isChecking) return <span className="text-[11px] font-bold text-blue bg-blue/10 px-2 py-0.5 rounded-full whitespace-nowrap">🔵 분석중</span>;
  const meta = CLASS_META[classifyExposure(post, mr, now)];
  return <span title={meta.desc} className={`text-[11px] font-bold px-2 py-0.5 rounded-full whitespace-nowrap cursor-help ${meta.cls}`}>{meta.emoji} {meta.text}</span>;
}

// 상세 모달 '최종 판정'용 서버 상태머신 판정(§19) 색상 — 종합 상태와 별개로 세부 verdict 를 그대로 보여준다.
const VERDICT_STYLE: Record<ExposureVerdict, string> = {
  exposed:      'text-up bg-up/10',
  missing:      'text-down bg-down/10',
  recheck:      'text-amber-600 bg-amber-500/15',
  checking:     'text-blue bg-blue/10',
  error:        'text-dim bg-border/40',
  unanalyzable: 'text-dim bg-border/40',
};

/**
 * @param teaser 등급이 모자란 회원. 화면을 막지 않고 최근 N일·상위 M건까지만 열어 보여준다.
 *   판정은 반드시 서버(page.tsx의 checkFeaturePage)가 내려준 값이어야 한다 — 클라이언트에서
 *   등급을 다시 계산하면 개발자도구로 뒤집을 수 있다. 어차피 서버 API 도 403 을 내지만,
 *   화면이 먼저 정직해야 "되는 줄 알고 눌렀는데 실패"하는 경험이 안 생긴다.
 */
export default function MissingPostsSection({
  teaser = false,
  // 등급을 여기서 짓지 않는다 — 손으로 적으면 plans.ts 를 바꿔도 이 기본값만 옛 등급으로
  // 남아 잠금 안내가 실제 게이트와 다른 등급을 말한다(2026-09-03 배지가 Free 로 남았던 것과 같은 함정).
  requiredPlan = requiredPlanFor('my.missing-posts') ?? 'pro',
}: { teaser?: boolean; requiredPlan?: PlanKey } = {}) {
  const [profile, setProfile] = useState<BloggerProfile | null>(null);
  // 프로필 조회가 끝났는가. profile===null 은 '없음'과 '아직 안 옴' 둘 다라서,
  // 이걸 구분 못 하면 로딩 중에 "블로그를 등록하면 확인합니다"라고 단정해버린다
  // (블로그가 멀쩡히 등록된 사용자에게 미등록이라고 말하는 셈).
  const [profileLoaded, setProfileLoaded] = useState(false);
  const [quota, setQuota] = useState<QuotaInfo | null>(null);
  // 이 화면 mount 당 조회 토큰 1개 (미노출 분석 데이터 요청에 공통 사용)
  const [viewToken] = useState(() => newViewToken());
  const [period, setPeriod] = useState<Period>(DEFAULT_PERIOD);
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');
  const [posts, setPosts] = useState<BlogPost[]>([]);
  const [postsLoading, setPostsLoading] = useState(true);
  const [missingResults, setMissingResults] = useState<MissingResultsMap>({});
  const [checkingAll, setCheckingAll] = useState(false);
  const [checkProgress, setCheckProgress] = useState({ current: 0, total: 0 });
  // 배치 시작 시각 — 실제 경과 속도로 남은 시간을 추정해 진행률 옆에 보여준다
  const [batchStartedAt, setBatchStartedAt] = useState<number | null>(null);
  // §12 배치 검사 완료 요약 — "N개 확인 완료 · 노출 X · 미노출 Y". 다음 배치 시작 시 초기화.
  // failed 는 확인에 실패한 건수다. 예전엔 세지 않아서 30개 중 12개가 실패해도 "18개 확인 완료"만
  // 보였고, 사용자는 나머지가 왜 사라졌는지도 크레딧이 어떻게 됐는지도 알 수 없었다.
  const [batchSummary, setBatchSummary] = useState<{ checked: number; exposed: number; missing: number; other: number; failedIds: string[] } | null>(null);
  const [checkingPostId, setCheckingPostId] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  // 대량 분석 확인 다이얼로그 대상 (§9~13) — 실제 네이버 검색이 발생할 글 수(toCheck)가 임계 이상일 때만 표시
  const [confirmBatch, setConfirmBatch] = useState<{ targets: BlogPost[]; toCheck: number; force: boolean } | null>(null);
  // 30일 이전 확장 조회(plan/authorize) 실패 안내. 수집 실패와 성격이 달라 자리를 나눈다 —
  // 하나로 합치면 "목록은 멀쩡한데 확장 조회만 실패한" 상황에 수집 실패 안내가 뜬다.
  const [extendError, setExtendError] = useState('');
  // 포스팅 수집이 비어서 끝난 이유. 예전엔 boolean 하나(postsFailed)였는데, 그러면
  // "네이버가 요청을 제한했다"와 "정말 글이 없다"에 같은 안내가 나가 사용자가 할 수 있는
  // 행동을 알 수 없었다. 이유별로 문구와 버튼이 갈라져야 막다른 길이 아니게 된다.
  const [collectCode, setCollectCode] = useState<CollectCode | null>(null);
  // NO_POSTS 는 실패가 아니라 사실이다(정상 응답 + 글 0개). 상단 카드가 '확인 실패'로 바뀌는 건
  // 진짜 수집이 안 된 경우뿐이어야 한다.
  const postsFailed = collectCode !== null && collectCode !== 'NO_POSTS';
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all'); // §3 기본값 '전체'
  const [areaFilter, setAreaFilter] = useState<AreaFilter>('all');
  const [sortBy, setSortBy] = useState<SortKey>('latest');
  const [detailPostId, setDetailPostId] = useState<string | null>(null);
  const [detailChecking, setDetailChecking] = useState(false);
  const [detailError, setDetailError] = useState('');
  const [detailHistory, setDetailHistory] = useState<HistoryEntry[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const abortRef = useRef(false);
  const batchRunningRef = useRef(false);
  const autoCheckedRef = useRef(false); // 진입 자동검사 1회만 실행
  // 개별 재검사(목록 '다시 검사' / 상세 '재검사') 중복 실행 방지 — 둘 다 force:true 라 캐시를 건너뛰고
  // 네이버를 실제로 치며 실행 시점에 과금된다. disabled 는 state 라 같은 프레임의 빠른 연속 클릭을
  // 못 막으므로(리렌더 전) 동기적으로 읽히는 ref 로 막는다. 목록/상세 버튼이 같은 글을 동시에 치는 것도 함께 차단.
  const singleCheckRef = useRef(false);

  // 회원/권한 (§3·§12·§13) + 크레딧 정책 모달 (§2·§6·§8)
  const { user, isError: authError, isLoading: authLoading } = useAuth();
  const isMember = !!user.id;
  const { openGate } = useMemberOnlyGate();
  const router = useRouter();
  // §2 "이전 포스팅도 확인하시겠습니까?" 진입 프롬프트
  const [showMorePrompt, setShowMorePrompt] = useState(false);
  const morePromptDismissedRef = useRef(false); // 여기까지만 보기 → 세션 내 재노출 안 함
  // 확장(30일 이전) 조회 게이트 모달 — confirm(무료 대량 안내)/credit(크레딧 안내)/insufficient(부족)
  const [extendModal, setExtendModal] = useState<
    | null
    | { phase: 'confirm'; scopeDays: Period; candidates: BlogPost[]; plan: ExtendPlan }
    | { phase: 'credit'; scopeDays: Period; candidates: BlogPost[]; plan: ExtendPlan }
    | { phase: 'insufficient'; required: number; balance: number }
  >(null);
  const [extendBusy, setExtendBusy] = useState(false); // plan/authorize 요청 중
  const [autoCheckDone, setAutoCheckDone] = useState(false); // 진입 자동검사(최근 30일) 완료 여부 — §2 프롬프트 트리거
  const extendJobRef = useRef<{ jobId: string | null; newCheckIds: string[] } | null>(null);
  const runningExtendedRef = useRef(false); // 중복 실행(이중 차감) 방지 가드 (§9)

  useEffect(() => () => { abortRef.current = true; }, []);

  useEffect(() => {
    (async () => {
      const p = await getProfileFromApi();
      setProfile(p);
      setProfileLoaded(true);
      // 프로필을 못 받으면 fetchPosts 가 아예 호출되지 않아 초기값 true 인 postsLoading 이
      // 영원히 풀리지 않는다 → 스피너 무한 회전. 여기서 로딩을 직접 종료한다.
      if (!p) setPostsLoading(false);
    })();
  }, []);

  const usingCustomRange = Boolean(customFrom || customTo);

  /**
   * 필터 상태 ↔ 주소창 동기화. 조건을 걸어 둔 화면을 그대로 북마크하거나 팀에 공유할 수 있어야 한다.
   *
   * next/navigation 의 router 대신 history.replaceState 를 쓰는 이유: 필터 변경은 네비게이션이
   * 아니다. 라우터를 태우면 글자를 한 자 칠 때마다 서버 컴포넌트가 다시 돌고 뒤로가기 기록이
   * 검색어 수만큼 쌓인다.
   *
   * 기간은 30일 이하만 복원한다 — 90일·전체는 크레딧이 붙는 확장 조회(beginExtended)를 거쳐야
   * 하는데, 주소창 값으로 곧바로 setPeriod 하면 그 승인 절차를 건너뛰게 된다.
   */
  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    const status = q.get('status');
    if (status && STATUS_FILTERS.some(f => f.key === status)) setStatusFilter(status as StatusFilter);
    const area = q.get('area');
    if (area && AREA_FILTERS.some(f => f.key === area)) setAreaFilter(area as AreaFilter);
    const sort = q.get('sort');
    if (sort && SORT_OPTIONS.some(o => o.key === sort)) setSortBy(sort as SortKey);
    const search = q.get('q');
    if (search) setSearchQuery(search);
    const p = Number(q.get('period'));
    if (PERIOD_OPTIONS.includes(p as Period) && !isExtendedPeriod(p as Period)) setPeriod(p as Period);
  }, []);

  // 첫 실행은 건너뛴다 — 위 복원 effect 가 세팅한 state 가 아직 반영되기 전이라, 여기서 바로 쓰면
  // 주소창에 있던 조건을 기본값으로 되덮어 지워 버린다.
  const urlSyncArmed = useRef(false);
  useEffect(() => {
    if (!urlSyncArmed.current) { urlSyncArmed.current = true; return; }
    const q = new URLSearchParams(window.location.search);
    const put = (key: string, value: string, fallback: string) => {
      if (value === fallback) q.delete(key); else q.set(key, value);
    };
    put('status', statusFilter, 'all');
    put('area', areaFilter, 'all');
    put('sort', sortBy, 'latest');
    put('q', searchQuery, '');
    put('period', String(period), String(DEFAULT_PERIOD));
    const qs = q.toString();
    window.history.replaceState(null, '', qs ? `${window.location.pathname}?${qs}` : window.location.pathname);
  }, [statusFilter, areaFilter, sortBy, searchQuery, period]);

  // 선택 기간의 시작일 (직접 선택 우선) — 최근 30일 통계 카드를 위해 최소 30일치는 항상 로드
  const rangeFrom = useMemo(() => {
    if (customFrom) return new Date(`${customFrom}T00:00:00`);
    if (period > 0) return new Date(Date.now() - period * DAY_MS);
    return null;
  }, [customFrom, period]);
  const rangeTo = useMemo(() => (customTo ? new Date(`${customTo}T23:59:59`) : null), [customTo]);
  const thirtyDaysAgo = useMemo(() => new Date(Date.now() - FREE_DAYS * DAY_MS), []);

  // 전체 포스팅 목록을 한 번 로드한다(캐시됨). 목록 조회 자체는 과금 대상이 아니며(네이버 노출 "검사"만 과금),
  // 이렇게 전체를 확보해야 30일 이전 개수·후보를 정확히 계산할 수 있다. 기간 필터는 클라이언트 표시용이다.
  const fetchPosts = useCallback(async (blogId: string) => {
    setPostsLoading(true);
    setCollectCode(null);
    try {
      const res = await fetchWithTimeout(
        `/api/blog/posts?blogId=${encodeURIComponent(blogId)}&all=true`,
        undefined,
        ALL_POSTS_TIMEOUT_MS,
      );
      const data = await res.json().catch(() => ({}));
      // 조회 실패는 '포스팅 0개'가 아니다. 이유를 세워 상단 카드가 0 대신 '확인 실패'를
      // 띄우게 한다 — 목록만 실패를 알리고 카드는 0 을 단언하면 사용자는 "미노출 0건"을
      // 좋은 소식으로 읽는다. 서버가 준 code 를 그대로 쓰되, 모르는 값은 일반 오류로 접는다.
      if (!res.ok) {
        const code = data?.code;
        setCollectCode(code === 'RATE_LIMITED' || code === 'NO_POSTS' ? code : 'UPSTREAM_ERROR');
        setPosts([]);
        return;
      }
      const list: BlogPost[] = Array.isArray(data.posts) ? data.posts : [];
      setPosts(list);
      // 200 인데 목록이 비었다면 서버가 "정말 글이 없다"(NO_POSTS)고 판단한 것이다.
      if (list.length === 0) setCollectCode('NO_POSTS');
    } catch (e) {
      // AbortError = 우리가 건 타임아웃. 네트워크 오류와 안내가 달라야 한다
      // ("다시 시도"가 소용 있는지 없는지가 다르다).
      setCollectCode((e as Error | null)?.name === 'AbortError' ? 'TIMEOUT' : 'NETWORK');
      setPosts([]);
    } finally {
      setPostsLoading(false);
    }
  }, []);

  const fetchMissingState = useCallback(async (blogId: string) => {
    try {
      const res = await fetchWithTimeout(
        `/api/my/post-missing-state?blogId=${encodeURIComponent(blogId)}`,
        { headers: viewHeaders(viewToken) },
      );
      if (!res.ok) {
        const exceeded = await readQuotaExceeded(res);
        if (exceeded) setQuota(exceeded);
        return;
      }
      const data = await res.json();
      setMissingResults(data.results || {});
    } catch { /* ignore */ }
  }, [viewToken]);

  // §7 특정 포스트의 노출↔미노출 전환 이력 로드 (상세 모달용)
  const fetchDetailHistory = useCallback(async (blogId: string, postId: string) => {
    if (teaser) return; // 어차피 403 — 부르지 않고 화면에서 잠금 안내를 낸다
    setHistoryLoading(true);
    try {
      const res = await fetchWithTimeout(
        `/api/my/post-missing-history?blogId=${encodeURIComponent(blogId)}&postId=${encodeURIComponent(postId)}`,
        { headers: viewHeaders(viewToken) },
      );
      if (!res.ok) { setDetailHistory([]); return; }
      const data = await res.json();
      setDetailHistory(Array.isArray(data.history) ? data.history : []);
    } catch { setDetailHistory([]); }
    finally { setHistoryLoading(false); }
  }, [viewToken, teaser]);

  useEffect(() => {
    if (!profile) return;
    fetchPosts(profile.blogId);
    fetchMissingState(profile.blogId);
  }, [profile, fetchPosts, fetchMissingState]);

  // 검사 1건 결과 — status(성공/실패) + 서버가 확정한 판정(verdict). 배치 완료 요약(§12)에서 노출/미노출 집계에 쓴다.
  // reason 이 있으면 '검사가 실패한 것'이 아니라 '검사를 시작할 수 없는 것'이다(로그인 끊김·크레딧 부족).
  // 그 두 경우엔 이미 로그인 게이트/부족 모달이 떠 있으므로, 그 위에 "잠시 후 다시 시도" 같은
  // 엉뚱한 안내를 겹쳐 띄우지 않는다 — 기다린다고 해결되는 상황이 아니다.
  type CheckOutcome = { status: 'ok' | 'failed'; verdict: ExposureVerdict | null; reason?: 'auth' | 'credit' | 'plan' };
  const checkOne = useCallback(async (post: BlogPost, opts?: { force?: boolean }): Promise<CheckOutcome> => {
    if (!profile) return { status: 'failed', verdict: null };
    // 비공개 글은 검색 노출 대상이 아니므로 네이버를 치지 않고 '분석불가'로 표시 (호출량·비용 절약)
    if (post.isPublic === false) {
      setMissingResults(prev => ({ ...prev, [post.id]: {
        blogTab: { exposed: null, rank: null },
        viewTab: { exposed: null, rank: null },
        influencerTab: { exposed: null, rank: null },
        status: 'unanalyzable', checkedAt: new Date().toISOString(),
      } }));
      return { status: 'ok', verdict: 'unanalyzable' };
    }
    const MAX_ATTEMPTS = 3;
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      try {
        const res = await fetch('/api/blog/check-missing', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ blogId: profile.blogId, postTitle: post.title, postId: post.id, checkInfluencer: true, force: opts?.force }),
        });
        // §20 30일 이전 글 과금 게이트 — 재시도·후속 배치 모두 같은 결과이므로 배치를 멈추고(abort) 한 번만 안내한다.
        if (res.status === 401) { abortRef.current = true; openGate('/my/missing-posts'); return { status: 'failed', verdict: null, reason: 'auth' }; }
        // 등급 부족(403). 재시도해도 결과가 같으므로 배치를 멈춘다. 티저에선 버튼을 이미 감춰
        // 여기까지 오지 않는 게 정상이지만, 검사 도중 이용권이 만료되면 도달할 수 있다 —
        // 그때 "검사 실패"로 남기면 원인이 등급이라는 걸 알 방법이 없다.
        if (res.status === 403) {
          abortRef.current = true;
          return { status: 'failed', verdict: null, reason: 'plan' };
        }
        if (res.status === 402) {
          abortRef.current = true;
          const d = await res.json().catch(() => ({}));
          setExtendModal({ phase: 'insufficient', required: d.required ?? 0, balance: d.balance ?? 0 });
          return { status: 'failed', verdict: null, reason: 'credit' };
        }
        if (res.ok) {
          const data = await res.json();
          // 서버가 반환한 status(ok/error/unanalyzable)를 그대로 존중한다 — 'error'(일시적 오류)를 미노출로 오판하지 않기 위함
          const status = data.status || 'ok';
          setMissingResults(prev => ({ ...prev, [post.id]: { ...data, status, checkedAt: data.checkedAt || new Date().toISOString() } }));
          // 일시적 오류는 성공 검사로 치지 않는다 → 다음 재검사 때 다시 확인되도록 'failed' 취급(집계엔 영향 없음)
          if (status === 'error') return { status: 'failed', verdict: null };
          return { status: 'ok', verdict: (data.overallStatus as ExposureVerdict | null) ?? null };
        }
      } catch { /* 재시도 */ }
      if (attempt < MAX_ATTEMPTS) await new Promise(r => setTimeout(r, 800 * attempt));
    }
    return { status: 'failed', verdict: null };
  }, [profile, openGate]);

  // 상세 패널에서 포스팅 제목 기반으로 강제 재검사 (캐시 무시, 최신 노출 여부 재확인)
  const recheckDetail = useCallback(async (post: BlogPost) => {
    if (singleCheckRef.current) return; // 중복 클릭 차단(이중 조회·이중 차감 방지)
    singleCheckRef.current = true;
    setDetailChecking(true);
    setDetailError('');
    try {
      const { status, reason } = await checkOne(post, { force: true });
      // reason 이 있으면 로그인 게이트나 크레딧 부족 모달이 이미 떠 있다 — 그 위에 겹쳐 안내하지 않는다.
      if (status === 'failed' && !reason) setDetailError('재검사에 실패했습니다. 잠시 후 다시 시도해주세요.');
      else if (profile) fetchDetailHistory(profile.blogId, post.id); // 전환이 기록됐을 수 있으니 이력 갱신
    } finally {
      // 예외로 빠져나가도 버튼이 '검사 중...'에 영구히 잠기지 않도록 반드시 해제한다
      setDetailChecking(false);
      singleCheckRef.current = false;
    }
  }, [checkOne, profile, fetchDetailHistory]);

  // §10 개별 게시글 '다시 검사' — 이 글 하나만 강제 재조회(전체 API 재호출 아님). 목록/카드는 checkOne 이 즉시 갱신.
  const recheckSingle = useCallback(async (post: BlogPost) => {
    if (checkingAll || singleCheckRef.current) return; // 배치 검사 중엔 비활성 + 중복 클릭 차단(이중 조회·이중 차감 방지)
    singleCheckRef.current = true;
    setCheckingPostId(post.id);
    setBatchSummary(null);
    try {
      await checkOne(post, { force: true });
    } finally {
      // 예외로 빠져나가도 버튼이 '검사 중'에 영구히 잠기지 않도록 반드시 해제한다
      setCheckingPostId(null);
      singleCheckRef.current = false;
    }
  }, [checkingAll, checkOne]);

  // 실제로 네이버 검색이 발생할 글만 센다 — 비공개(분석불가)·최근 성공검사(캐시 신선)는 호출이 없으므로 조회량 추정에서 제외
  const willHitNaver = useCallback((post: BlogPost, now: number): boolean => {
    if (post.isPublic === false) return false;
    const ex = missingResults[post.id];
    const fresh = ex?.status === 'ok' && !!ex.checkedAt && (now - new Date(ex.checkedAt).getTime()) < CHECK_FRESH_MS;
    return !fresh;
  }, [missingResults]);

  const runBatch = useCallback(async (targets: BlogPost[], opts?: { force?: boolean }) => {
    // 진행 중 재진입 차단 — 두 배치가 겹치면 같은 글을 두 번 조회하고 진행률도 서로 덮어쓴다
    if (!profile || targets.length === 0 || batchRunningRef.current) return;
    batchRunningRef.current = true;
    setCheckingAll(true);
    setBatchSummary(null); // 이전 요약 초기화 — 새 배치가 시작됨
    abortRef.current = false;
    setCheckProgress({ current: 0, total: targets.length });
    setBatchStartedAt(Date.now());
    const now = Date.now();
    // §12 완료 요약용 집계 — 실제로 이번 배치에서 확인(checkOne 호출)된 글만 센다(캐시로 건너뛴 글 제외).
    const tally = { checked: 0, exposed: 0, missing: 0, other: 0, failedIds: [] as string[] };
    for (let i = 0; i < targets.length; i++) {
      if (abortRef.current) break;
      const post = targets[i];
      // force면 신선도 무시하고 공개글은 항상 재검사(사용자가 명시적으로 '다시 확인' 요청한 경우, §8)
      const hits = opts?.force ? post.isPublic !== false : willHitNaver(post, now);
      if (hits || post.isPublic === false) {
        // 비공개 글은 checkOne이 네이버 호출 없이 '분석불가'로 표시하고 즉시 반환
        setCheckingPostId(post.id);
        const { status, verdict, reason } = await checkOne(post, { force: opts?.force });
        // 노출/미노출만 개별 집계, 그 외(재검사·확인중·분석불가)는 '기타'. 미확인을 미노출로 세지 않는다(§10).
        if (status === 'ok') {
          tally.checked++;
          if (verdict === 'exposed') tally.exposed++;
          else if (verdict === 'missing') tally.missing++;
          else tally.other++;
        } else if (!reason) {
          // reason 이 있으면 로그인·크레딧·등급 문제라 별도 모달이 이미 떴다 — 검사 실패로 세지 않는다.
          tally.failedIds.push(post.id);
        }
        // 실제 네이버 호출이 있었던 경우에만 요청 간격을 둔다 (캐시/분석불가는 지연 불필요)
        if (hits && i < targets.length - 1) await new Promise(r => setTimeout(r, 2000));
      }
      setCheckProgress({ current: i + 1, total: targets.length });
    }
    setCheckingPostId(null);
    setCheckingAll(false);
    setBatchStartedAt(null);
    batchRunningRef.current = false;
    // 전부 실패해도 요약은 띄운다 — 아무것도 안 뜨면 사용자는 검사가 돌긴 했는지조차 모른다.
    if (tally.checked > 0 || tally.failedIds.length > 0) setBatchSummary(tally);
  }, [profile, willHitNaver, checkOne]);

  // 대량 분석 게이트 (§9~13): 실제 검색이 발생할 글이 10개 이하면 즉시, 그 이상이면 비용 안내 확인 후 실행
  const requestBatch = useCallback((targets: BlogPost[], opts?: { force?: boolean }) => {
    if (targets.length === 0) return;
    const now = Date.now();
    const toCheck = opts?.force
      ? targets.filter(p => p.isPublic !== false).length
      : targets.filter(p => willHitNaver(p, now)).length;
    if (toCheck <= 10) { runBatch(targets, opts); return; }
    setConfirmBatch({ targets, toCheck, force: !!opts?.force });
  }, [willHitNaver, runBatch]);

  // §1·§20 진입 시 "최근 30일" 무료 구간만 자동검사한다. 30일 이전은 회원 전용 확장 흐름(beginExtended)에서만 검사.
  useEffect(() => {
    if (!profile || postsLoading || posts.length === 0 || autoCheckedRef.current) return;
    autoCheckedRef.current = true;
    // 티저는 자동검사를 돌리지 않는다 — 서버가 403 을 낼 호출을 30건 쏘아 놓고
    // 화면엔 '검사 실패'만 남기게 된다. 저장된 판정(post-missing-state)은 그대로 보인다.
    if (teaser) { setAutoCheckDone(true); return; }
    const freeCutoff = thirtyDaysAgo.getTime();
    const recent = [...posts]
      .filter(p => (parsePostDate(p.date)?.getTime() ?? 0) >= freeCutoff) // 무료 구간(최근 30일)만
      .sort((a, b) => (parsePostDate(b.date)?.getTime() || 0) - (parsePostDate(a.date)?.getTime() || 0))
      .slice(0, AUTO_CHECK_LIMIT);
    const now = Date.now();
    if (recent.some(p => willHitNaver(p, now))) runBatch(recent);
    setAutoCheckDone(true);
  }, [profile, postsLoading, posts, thirtyDaysAgo, willHitNaver, runBatch, teaser]);

  // 30일 이전 공개 글 수(§2·§4 "추가 확인 가능") — 회원 확장 조회 후보의 최대 규모.
  const olderCount = useMemo(() => {
    const cutoff = thirtyDaysAgo.getTime();
    return posts.filter(p => p.isPublic !== false && (parsePostDate(p.date)?.getTime() ?? Infinity) < cutoff).length;
  }, [posts, thirtyDaysAgo]);

  // §4·§18 30일 이전 후보: 선택 scope 내(scopeDays>0면 그 기간 이내) & 30일 이전 & 공개 글
  const olderCandidatesFor = useCallback((scopeDays: Period): BlogPost[] => {
    const now = Date.now();
    const cutoff = now - FREE_DAYS * DAY_MS;
    const scopeFrom = scopeDays > 0 ? now - scopeDays * DAY_MS : -Infinity;
    return posts.filter(p => {
      if (p.isPublic === false) return false;
      const t = parsePostDate(p.date)?.getTime();
      if (t == null) return false;
      return t < cutoff && t >= scopeFrom;
    });
  }, [posts]);

  // §9·§10·§20 확장 조회 실행: 서버 승인(과금) → 배치 검사 → 정산(환불). 승인 실패(부족)면 부족 모달.
  const runExtended = useCallback(async (candidates: BlogPost[]) => {
    if (!profile || candidates.length === 0) return;
    if (runningExtendedRef.current) return; // §9 중복 클릭/동시 실행 차단 — 이중 차감 방지
    runningExtendedRef.current = true;
    const clientJobId = newViewToken(); // 멱등 키(uuid)
    setExtendBusy(true);
    try {
      const res = await fetch('/api/blog/exposure-extend/authorize', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ blogId: profile.blogId, candidatePostIds: candidates.map(p => p.id), clientJobId }),
      });
      if (res.status === 402) {
        const d = await res.json().catch(() => ({}));
        setExtendModal({ phase: 'insufficient', required: d.required ?? 0, balance: d.balance ?? 0 });
        return;
      }
      if (!res.ok) {
        // 로그인이 끊겼으면(401) 검사 배치(checkOne)와 똑같이 로그인 게이트를 띄운다.
        // 예전에는 이 경로만 "승인에 실패했습니다" 로 끝나서, 사용자는 왜 안 되는지도
        // 다시 로그인하면 된다는 것도 모른 채 같은 버튼을 계속 눌러야 했다.
        if (res.status === 401) { openGate('/my/missing-posts'); return; }
        const d = await res.json().catch(() => ({}));
        setExtendError(d.error || '확장 조회 승인에 실패했습니다. 잠시 후 다시 시도해 주세요.');
        return;
      }
      const auth = await res.json();
      const newIds: string[] = Array.isArray(auth.newCheckIds) ? auth.newCheckIds : [];
      extendJobRef.current = { jobId: auth.jobId ?? null, newCheckIds: newIds };
      const idSet = new Set(newIds);
      const newPosts = candidates.filter(p => idSet.has(p.id));
      setExtendModal(null);
      setShowMorePrompt(false);
      morePromptDismissedRef.current = true; // 확장 조회 시작 후엔 §2 프롬프트 재노출 안 함
      await runBatch(newPosts, { force: false });
      // §10 정산 — 완료/중단 무관하게 서버가 DB 근거로 미완료 과금분을 환불 산정
      const jr = extendJobRef.current;
      if (jr?.jobId) {
        fetch('/api/blog/exposure-extend/settle', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ jobId: jr.jobId, blogId: profile.blogId, newCheckIds: jr.newCheckIds, status: abortRef.current ? 'cancelled' : 'completed' }),
        }).catch(() => {});
      }
    } catch { setExtendError('확장 조회 중 오류가 발생했습니다. 네트워크 상태를 확인하고 다시 시도해 주세요.'); }
    finally { setExtendBusy(false); runningExtendedRef.current = false; }
  }, [profile, runBatch, openGate]);

  // §2·§3·§12·§20 확장 조회 시작(권한·계획·모달 분기).
  const beginExtended = useCallback(async (scopeDays: Period, opts?: { fromPrompt?: boolean }) => {
    if (!profile) return;
    if (!isMember) { openGate('/my/missing-posts'); return; } // §3 비회원 → 로그인/회원가입 (API 호출 안 함)
    // 티저는 확장 조회 자체가 등급 밖이다(exposure-extend 가 403). 기간만 넓혀 두고
    // API 는 부르지 않는다 — 잠금 안내는 목록 아래 CTA 가 이미 하고 있다.
    if (teaser) { setPeriod(scopeDays); setShowMorePrompt(false); return; }
    setPeriod(scopeDays); setCustomFrom(''); setCustomTo(''); // 목록에 30일 이전 글 노출(미확인 상태)
    const candidates = olderCandidatesFor(scopeDays);
    if (candidates.length === 0) { setShowMorePrompt(false); return; }
    setExtendError(''); // 새 시도가 시작되면 이전 실패 문구는 사실이 아니다
    setExtendBusy(true);
    try {
      const res = await fetch('/api/blog/exposure-extend/plan', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ blogId: profile.blogId, candidatePostIds: candidates.map(p => p.id) }),
      });
      if (!res.ok) {
        if (res.status === 401) { openGate('/my/missing-posts'); return; }
        const d = await res.json().catch(() => ({}));
        setExtendError(d.error || '조회 대상 계산에 실패했습니다. 잠시 후 다시 시도해 주세요.');
        return;
      }
      const plan: ExtendPlan = await res.json();
      if (plan.newChecks === 0) { setShowMorePrompt(false); return; } // 이미 전부 캐시/확인됨 — 추가 조회 불필요
      if (plan.creditsEnabled && plan.chargeable > 0) {
        if (plan.balance < plan.estCredits) { setExtendModal({ phase: 'insufficient', required: plan.estCredits, balance: plan.balance }); return; }
        setExtendModal({ phase: 'credit', scopeDays, candidates, plan }); return;
      }
      // 무료(≤90 또는 크레딧 비활성): §2 프롬프트 경유면 이미 동의 → 바로 실행. 기간버튼 경유면 대량 안내 확인.
      if (opts?.fromPrompt) await runExtended(candidates);
      else setExtendModal({ phase: 'confirm', scopeDays, candidates, plan });
    } catch { setExtendError('조회 대상 계산 중 오류가 발생했습니다. 네트워크 상태를 확인하고 다시 시도해 주세요.'); }
    finally { setExtendBusy(false); }
  }, [profile, isMember, openGate, olderCandidatesFor, runExtended, teaser]);

  // §2 최근 30일 자동검사 완료 후, 30일 이전 글이 있으면 "이전 포스팅도 확인하시겠습니까?" 프롬프트 노출(1회).
  useEffect(() => {
    if (teaser) return; // 티저에겐 권할 수 없는 동작이다
    if (!autoCheckDone || checkingAll || postsLoading) return;
    if (morePromptDismissedRef.current) return;
    if (isExtendedPeriod(period)) return; // 이미 확장 조회로 진입함
    if (olderCount > 0) setShowMorePrompt(true);
  }, [autoCheckDone, checkingAll, postsLoading, period, olderCount, teaser]);

  // 선택한 기간(직접 선택 포함)으로 정확히 트리밍 — fetchPosts는 안전을 위해 30일치를 항상 더 넉넉히 불러오므로 여기서 최종 필터링
  const periodPosts = useMemo(() => posts.filter(p => {
    const d = parsePostDate(p.date);
    if (!d) return true; // 날짜 파싱 불가 시 보수적으로 포함
    if (rangeFrom && d < rangeFrom) return false;
    if (rangeTo && d > rangeTo) return false;
    return true;
  }), [posts, rangeFrom, rangeTo]);

  // 발행 시각(publishedAt)을 붙인 버전 — 색인 지연 유예 판정(missing-rate.ts)에 사용
  const periodPostsDated = useMemo(() => periodPosts.map(p => ({ ...p, publishedAt: parsePostDate(p.date) })), [periodPosts]);

  // §2 종합 상태별 집계 — 전체 포스팅을 정상/일부/미노출/미확인 등으로 분류(상단 카드·빠른 필터 공용).
  // missing 은 countMissing(=대시보드)와 동일 기준이라 내 블로그 대시보드 미노출 수와 일치한다(§12).
  const classCounts = useMemo(() => countByExposureClass(periodPostsDated, missingResults), [periodPostsDated, missingResults]);
  const normalCount = classCounts.normal;
  const partialCount = classCounts.partial;
  const missingCount = classCounts.missing;
  // '미확인' 카드 = 아직 확정 안 된 전부(미검사·확인 중·확인 실패·분석 불가) → 네 상태 카드 합 = 전체 포스팅
  const unknownCount = classCounts.unchecked + classCounts.checking + classCounts.error + classCounts.unanalyzable;
  // 발행 후 유예 기간 내라 미노출 집계에서 제외된 게시글 수(투명성 안내용)
  const indexingWaitCount = useMemo(() => countIndexingWait(periodPostsDated, missingResults), [periodPostsDated, missingResults]);
  // §11 모든 영역 미노출 1회 관측 후 재검증 대기 중인 글 수(아직 미노출 확정 아님)
  const recheckCount = useMemo(() => {
    const now = Date.now();
    return periodPostsDated.filter(p => displayVerdict(p, missingResults[p.id], now) === 'recheck').length;
  }, [periodPostsDated, missingResults]);

  const pct = (n: number) => periodPosts.length === 0 ? 0 : Math.round((n / periodPosts.length) * 100);

  /**
   * 직전 동일 길이 기간의 집계 — "최근 30일 미노출 8건"이 나아지는 중인지 나빠지는 중인지
   * 숫자 하나로는 알 수 없어서 붙인다. 기준 구간의 길이를 모르면(「전체」기간) 비교하지 않는다.
   *
   * confirmed 를 따로 세는 이유: 직전 기간은 검사를 안 돌린 글이 많을 수 있고, 그러면 노출/미노출이
   * 실제로 0인지 안 세어 본 건지 구분되지 않는다. 확정 판정이 한 건도 없는 기간과는 비교하지 않는다.
   */
  const prevPeriod = useMemo(() => {
    if (!rangeFrom) return null;
    const span = (rangeTo ?? new Date()).getTime() - rangeFrom.getTime();
    if (span <= 0) return null;
    const prevFrom = new Date(rangeFrom.getTime() - span);
    const list = posts
      .map(p => ({ ...p, publishedAt: parsePostDate(p.date) }))
      .filter(p => p.publishedAt !== null && p.publishedAt >= prevFrom && p.publishedAt < rangeFrom);
    const c = countByExposureClass(list, missingResults);
    return { total: list.length, normal: c.normal, partial: c.partial, missing: c.missing, confirmed: c.normal + c.partial + c.missing };
  }, [posts, rangeFrom, rangeTo, missingResults]);

  /** 직전 기간 대비 증감. 비교 대상이 없거나(=null) 변화가 없으면 화살표를 띄우지 않는다. */
  const deltaOf = (curr: number, prev: number | undefined) => {
    if (prev === undefined) return undefined;
    const diff = curr - prev;
    if (diff === 0) return undefined;
    return { direction: diff > 0 ? 'up' as const : 'down' as const, value: Math.abs(diff) };
  };
  /** 검사가 돌지 않은 직전 기간과 노출 지표를 비교하면 "미노출이 줄었다"는 거짓말이 된다. */
  const comparableExposure = prevPeriod !== null && prevPeriod.confirmed > 0;
  const periodSpanLabel = usingCustomRange ? '직전 같은 길이 기간' : `직전 ${period}일`;

  /**
   * §13 '아직 확인하지 않음' ≠ '0건'.
   *
   * 비회원이거나 블로그를 등록하지 않았으면 /api/blog/posts 조회가 아예 일어나지 않는다.
   * 그런데 프로필이 없으면 postsLoading 이 곧바로 false 로 풀리기 때문에(무한 스피너를
   * 막으려고 그렇게 해뒀다) 카드가 로딩도 아니고 실측도 아닌 상태로 **전부 0** 을 띄웠다.
   * "미노출 0건"은 좋은 소식처럼 읽히는데, 실제로는 한 건도 확인하지 않은 것이다.
   * 아래 포스팅 목록은 이 두 경우를 이미 갈라 안내하므로 카드도 같은 기준을 쓴다.
   */
  /**
   * 여기에 조회 실패(postsFailed)도 포함한다.
   * 로그인·블로그 연결이 다 돼 있어도 /api/blog/posts 가 실패하면 posts 는 [] 가 되고,
   * 그러면 다섯 카드가 전부 실측된 것처럼 0 을 단언한다. 실제로 화면 아래 목록은
   * "게시물을 수집하지 못했습니다"라고 정직하게 말하는데 카드만 0 이라 서로 모순됐다.
   */
  /**
   * 신원·프로필이 아직 안 왔으면 아무 판정도 하지 않는다 — 카드는 로딩 상태로 둔다.
   *
   * authLoading 중에는 isMember 가 false 라서, 로그인한 사용자에게도 진입 직후
   * "로그인하면 확인합니다"가 떴다(실화면 확인). profile 도 같은 이유로 함께 기다린다.
   * 둘 다 '없음'이 아니라 '아직 모름'이며, 모르는 상태에서 안내를 단정하면 안 된다.
   */
  const identityPending = authLoading || (isMember && !profileLoaded);
  const notMeasured = !identityPending && (!isMember || !profile?.blogId || postsFailed);
  const notMeasuredReason = !isMember
    ? '로그인하면 확인합니다'
    : !profile?.blogId
      ? '블로그를 등록하면 확인합니다'
      : '포스팅 목록을 불러오지 못했습니다';
  /** 조회 실패는 '아직 안 함'이 아니라 '해봤는데 실패'다 — 카드 문구를 갈라 쓴다. */
  const notMeasuredStatus = postsFailed && isMember && profile?.blogId ? '확인 실패' : '확인 전';

  /**
   * 마지막으로 성공한 검사 시각. 지금 수집이 실패해도 저장된 판정은 남아 있으므로,
   * "언제 것까지는 믿어도 되는지"를 알려줘야 실패 안내가 막다른 길이 되지 않는다.
   */
  const lastSuccessAt = useMemo(() => {
    let latest = 0;
    for (const r of Object.values(missingResults)) {
      const t = r?.checkedAt ? new Date(r.checkedAt).getTime() : 0;
      if (t > latest) latest = t;
    }
    return latest > 0 ? new Date(latest) : null;
  }, [missingResults]);

  /** 다음 자동 재수집(크론) 시각 — 오늘 KST 10시가 지났으면 내일 10시. */
  const nextAutoRecheck = useMemo(() => {
    const now = new Date();
    const kstHour = Number(now.toLocaleString('en-US', { timeZone: 'Asia/Seoul', hour: '2-digit', hour12: false }));
    const d = new Date(now);
    d.setDate(d.getDate() + (kstHour >= AUTO_RECHECK_KST_HOUR ? 1 : 0));
    return `${d.toLocaleDateString('ko-KR', { timeZone: 'Asia/Seoul', month: 'long', day: 'numeric' })} 오전 ${AUTO_RECHECK_KST_HOUR}시`;
  }, []);

  // §1 기본 목록 = 전체 포스팅. 빠른 상태 필터(§3)·영역 필터·제목 검색·정렬을 차례로 적용한다.
  // (이전엔 미노출+재검사 글만 보여줬으나, 이제 전체 포스팅을 보여주고 필터로 좁힌다.)
  const displayList = useMemo(() => {
    const now = Date.now();
    let list = periodPostsDated;
    // §3 종합 상태 빠른 필터
    if (statusFilter !== 'all') {
      list = list.filter(p => {
        const c = classifyExposure(p, missingResults[p.id], now);
        // '미확인' 필터엔 아직 확정 안 된 전부(미검사·확인 중·확인 실패·분석 불가)를 포함 — 상단 '미확인' 카드 숫자와 일치
        if (statusFilter === 'unchecked') return c === 'unchecked' || c === 'checking' || c === 'error' || c === 'unanalyzable';
        return c === statusFilter; // normal/partial/missing
      });
    }
    // 영역 필터(통합검색/블로그/인플루언서 미노출만) — 기존 기능 유지(빠른 필터와 AND 결합)
    if (areaFilter !== 'all') {
      list = list.filter(p => {
        const mr = missingResults[p.id];
        if (!mr) return false;
        const exp = areaFilter === 'view' ? mr.viewTab.exposed : areaFilter === 'blog' ? mr.blogTab.exposed : (mr.influencerTab?.exposed ?? null);
        return exp === false;
      });
    }
    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase();
      list = list.filter(p => p.title.toLowerCase().includes(q));
    }
    const arr = [...list];
    if (sortBy === 'latest') arr.sort((a, b) => (parsePostDate(b.date)?.getTime() || 0) - (parsePostDate(a.date)?.getTime() || 0));
    else if (sortBy === 'oldest') arr.sort((a, b) => (parsePostDate(a.date)?.getTime() || 0) - (parsePostDate(b.date)?.getTime() || 0));
    else if (sortBy === 'title') arr.sort((a, b) => a.title.localeCompare(b.title, 'ko'));
    else if (sortBy === 'missingRate') arr.sort((a, b) => missingAreaCount(missingResults[b.id]) - missingAreaCount(missingResults[a.id]));
    return arr;
  }, [periodPostsDated, missingResults, statusFilter, areaFilter, searchQuery, sortBy]);

  // 티저 — 등급이 모자라면 최근 N일 안에서 상위 M건까지만 실제 판정을 보여준다.
  // 자르는 기준을 '상위 M건'만으로 하지 않는 이유: 정렬을 오래된순으로 바꾸면 몇 번의 클릭으로
  // 전체를 훑을 수 있어 잠금이 사실상 사라진다. 기간으로 먼저 자르고 그 안에서 개수를 자른다.
  const teaserList = useMemo(() => {
    if (!teaser) return displayList;
    const cutoff = Date.now() - MISSING_POSTS_TEASER.days * DAY_MS;
    return displayList
      .filter(p => (p.publishedAt?.getTime() ?? 0) >= cutoff)
      .slice(0, MISSING_POSTS_TEASER.rows);
  }, [teaser, displayList]);
  const lockedCount = displayList.length - teaserList.length;

  // 2026-09-04(오렌지 결정): 이 화면의 첫 화면은 최근 10개다. 「더 보기」로 전체까지 펼친다.
  // 여기서만 화면 단에서 자른다 — 대시보드 위젯과 달리 이 화면은 필터·정렬·전체 검사가
  // 목록 전체를 필요로 하므로(그게 이 화면이 파는 값이다) 서버에서 10개로 끊으면 기능이 죽는다.
  const [showAllRecent, setShowAllRecent] = useState(false);
  const visibleList = useMemo(
    () => (teaser || showAllRecent ? teaserList : teaserList.slice(0, MISSING_POSTS_RECENT_LIMIT)),
    [teaser, showAllRecent, teaserList],
  );
  const collapsedCount = teaserList.length - visibleList.length;

  /**
   * 지금 걸려 있는 조건들. 정렬은 넣지 않는다 — 순서를 바꿀 뿐 목록에서 글을 빼지 않으므로,
   * "왜 이 글이 안 보이지"의 답이 될 수 없는 항목까지 칩으로 두면 해제할 것을 찾기 어려워진다.
   */
  const activeChips: { key: string; label: string; clear: () => void }[] = [];
  if (usingCustomRange) {
    activeChips.push({ key: 'range', label: `기간 ${customFrom || '처음'} ~ ${customTo || '오늘'}`, clear: () => { setCustomFrom(''); setCustomTo(''); } });
  } else if (period !== DEFAULT_PERIOD) {
    // 확장 기간은 크레딧을 써서 연 것이라 칩으로 되돌릴 때도 기본값으로만 내린다(재승인 없이 다시 못 연다).
    activeChips.push({ key: 'period', label: `기간 ${period === 0 ? '전체' : `${period}일`}`, clear: () => setPeriod(DEFAULT_PERIOD) });
  }
  if (statusFilter !== 'all') {
    activeChips.push({ key: 'status', label: `상태 ${STATUS_FILTERS.find(f => f.key === statusFilter)!.label}`, clear: () => setStatusFilter('all') });
  }
  if (areaFilter !== 'all') {
    activeChips.push({ key: 'area', label: AREA_FILTERS.find(f => f.key === areaFilter)!.chip, clear: () => setAreaFilter('all') });
  }
  if (searchQuery.trim()) {
    activeChips.push({ key: 'q', label: `검색 “${searchQuery.trim()}”`, clear: () => setSearchQuery('') });
  }
  const clearAllFilters = () => {
    setStatusFilter('all'); setAreaFilter('all'); setSearchQuery('');
    setCustomFrom(''); setCustomTo(''); setPeriod(DEFAULT_PERIOD);
  };

  /**
   * 화면에 보이는 목록을 그대로 CSV 로 내보낸다(필터·정렬 적용 상태 그대로).
   * 서버 라우트를 새로 두지 않는 이유: 이 표의 판정은 이미 전부 클라이언트에 와 있어 서버를 다시
   * 태워도 같은 값이고, 라우트를 늘리면 권한 검사 지점만 하나 더 생긴다.
   * 티저 사용자에게는 버튼 자체를 잠가 둔다(위 렌더 참고).
   */
  const downloadCsv = () => {
    const rows = displayList.map((p, i) => {
      const mr = missingResults[p.id];
      const cls = classifyExposure(p, mr, Date.now());
      const area = (v: boolean | null | undefined) => v === true ? '노출' : v === false ? '미노출' : '확인 불가';
      return [
        i + 1, p.title, p.category || '', p.date,
        area(mr?.viewTab.exposed), area(mr?.blogTab.exposed), area(mr?.influencerTab?.exposed),
        mr?.searchVolume ?? '', CLASS_META[cls].text,
        mr?.checkedAt ? formatCheckedAt(mr.checkedAt) : '',
        `https://blog.naver.com/${profile?.blogId ?? ''}/${p.id}`,
      ];
    });
    const csv = rowsToCsv(
      ['순번', '제목', '카테고리', '발행일', '통합검색', '블로그', '인플루언서', '검색량', '종합 상태', '마지막 확인', '주소'],
      rows,
    );
    downloadCsvInBrowser(`노출현황_${profile?.blogId ?? 'blog'}_${todayStamp()}.csv`, csv);
  };

  // §9 '미확인 n개 검사' 대상 = 실제 상태가 '미확인'(검사 기록 없음)인 글만. 단, 무료 구간(최근 30일)만 —
  // 30일 이전 미확인 글은 회원 전용 확장 조회(크레딧 정책)로만 검사되므로 이 무료 버튼 대상에서 제외한다.
  const uncheckedPosts = useMemo(() => {
    const freeCutoff = thirtyDaysAgo.getTime();
    return periodPostsDated.filter(p => {
      const t = p.publishedAt?.getTime();
      if (t == null || t < freeCutoff) return false; // 30일 이전 제외
      return classifyExposure(p, missingResults[p.id]) === 'unchecked';
    });
  }, [periodPostsDated, missingResults, thirtyDaysAgo]);
  const uncheckedCount = uncheckedPosts.length;

  const toggleOne = useCallback((id: string) => {
    setSelectedIds(prev => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  }, []);
  // '전체 선택'은 화면에 보이는 것만 고른다 — 접혀 있는 글까지 몰래 선택하면 재검사 대상이 어긋난다.
  const allVisibleSelected = visibleList.length > 0 && visibleList.every(p => selectedIds.has(p.id));
  const toggleAll = useCallback(() => {
    const visibleIds = visibleList.map(p => p.id);
    setSelectedIds(prev => {
      const everySelected = visibleIds.length > 0 && visibleIds.every(id => prev.has(id));
      const n = new Set(prev);
      if (everySelected) visibleIds.forEach(id => n.delete(id));
      else visibleIds.forEach(id => n.add(id));
      return n;
    });
  }, [visibleList]);

  const detailPost = useMemo(() => posts.find(p => p.id === detailPostId) || null, [posts, detailPostId]);
  const detailMr = detailPostId ? missingResults[detailPostId] : undefined;
  const detailCauses = useMemo(() => buildCauseAnalysis(detailMr), [detailMr]);
  const detailVerdict = useMemo<ExposureVerdict | null>(() => {
    if (!detailPost) return null;
    return displayVerdict({ ...detailPost, publishedAt: parsePostDate(detailPost.date) }, detailMr, Date.now());
  }, [detailPost, detailMr]);

  // 상세 모달이 열릴 때 해당 포스트의 전환 이력을 불러온다
  useEffect(() => {
    if (!profile || !detailPostId) { setDetailHistory([]); return; }
    fetchDetailHistory(profile.blogId, detailPostId);
  }, [profile, detailPostId, fetchDetailHistory]);

  const closeDetail = useCallback(() => {
    setDetailPostId(null);
    setDetailError('');
  }, []);

  // 무료 하루 3회 조회 초과 — 데이터 대신 안내 화면 (서버가 402로 미노출 데이터를 반환하지 않음)
  if (quota) {
    return <AnalysisQuotaNotice quota={quota} />;
  }

  // 진행률이 한 칸 오를 때마다 다시 계산된다(별도 타이머 불필요 — 건당 몇 초 단위로 진행)
  const batchEta = estimateEta(batchStartedAt, checkProgress.current, checkProgress.total, Date.now());

  return (
    <div className="space-y-6">
      <PageHeader
        title="노출 현황"
        description="내 블로그 전체 포스팅의 네이버 검색(통합검색·블로그·인플루언서) 노출 상태를 확인합니다."
        actions={<>
          {checkingAll ? (
            <>
              <span className="flex items-center gap-1.5 px-4 py-2 bg-accent text-white font-bold rounded-xl text-xs">
                <span className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                {checkProgress.current}/{checkProgress.total} 분석 중
                {batchEta && <span className="font-semibold text-white/75">· {batchEta}</span>}
              </span>
              <button onClick={() => { abortRef.current = true; }}
                className="px-3 py-2 border border-border text-dim font-semibold rounded-xl hover:bg-surface-hover transition cursor-pointer text-xs">
                중단
              </button>
            </>
          ) : teaser ? (
            // 티저는 새 검사를 시작할 수 없다(서버가 403). 눌리는 버튼을 남겨두면
            // "눌렀는데 아무 일도 안 일어난다"가 되므로 아예 업그레이드 동선으로 바꾼다.
            <Link
              href={`${SUBSCRIBE_PATH}?required=${requiredPlan}`}
              className="px-4 py-2 bg-accent text-white font-bold rounded-xl hover:bg-accent-hover transition text-xs"
            >
              {planLabel(requiredPlan)} 이용권으로 전체 검사
            </Link>
          ) : (
            <>
              {selectedIds.size > 0 && (
                <button onClick={() => requestBatch(periodPosts.filter(p => selectedIds.has(p.id)), { force: true })}
                  className="px-4 py-2 bg-accent text-white font-bold rounded-xl hover:bg-accent-hover transition cursor-pointer text-xs">
                  선택한 {selectedIds.size}개 재검사
                </button>
              )}
              <button
                onClick={() => uncheckedCount > 0 ? requestBatch(uncheckedPosts) : requestBatch(periodPosts, { force: true })}
                disabled={periodPosts.length === 0}
                className="px-4 py-2 bg-accent text-white font-bold rounded-xl hover:bg-accent-hover transition cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed text-xs">
                {uncheckedCount > 0 ? `미확인 ${uncheckedCount}개 검사` : '전체 재검사'}
              </button>
            </>
          )}
        </>}
      />

      {/* §12 배치 검사 완료 요약 — "N개 확인 완료 · 노출 X · 미노출 Y" */}
      {!checkingAll && batchSummary && (
        <div className="flex items-start justify-between gap-3 px-4 py-2.5 rounded-xl bg-accent/10 border border-accent/20 text-xs">
          <div className="text-text">
            <b className="font-bold">{batchSummary.checked}개 확인 완료</b>
            <span className="text-up font-semibold ml-2">🟢 노출 {batchSummary.exposed}</span>
            <span className="text-down font-semibold ml-2">🔴 미노출 {batchSummary.missing}</span>
            {batchSummary.other > 0 && (
              <span className="text-dim ml-2">그 외 {batchSummary.other}(재검사·확인 중·분석 불가)</span>
            )}
            {/* 실패 건을 감추면 "확인 완료 N개"가 전체인 것처럼 읽히고, 차감된 크레딧이
                돌아왔는지도 알 수 없다. 실패 수·환불·재시도를 같이 준다. */}
            {batchSummary.failedIds.length > 0 && (
              <p className="mt-1 text-dim leading-relaxed">
                <span className="text-down font-semibold">{batchSummary.failedIds.length}개는 확인하지 못했습니다.</span>{' '}
                네이버가 일시적으로 응답하지 않았을 수 있습니다. 실패한 건의 크레딧은 자동으로 환불되며, 다음 자동 재검사는 {nextAutoRecheck}입니다.
                <button
                  type="button"
                  onClick={() => {
                    const ids = new Set(batchSummary.failedIds);
                    requestBatch(posts.filter(p => ids.has(p.id)), { force: true });
                  }}
                  className="ml-1.5 text-accent underline cursor-pointer"
                >
                  실패한 건만 다시 검사
                </button>
              </p>
            )}
          </div>
          <button onClick={() => setBatchSummary(null)}
            className="text-dim hover:text-text transition cursor-pointer shrink-0" aria-label="요약 닫기">&times;</button>
        </div>
      )}

      {/* 1. 노출 현황 판정 안내.
          예전엔 굵은 글씨가 스무 군데 넘게 박힌 네 문단이 화면 맨 위를 차지해, 강조가 너무 많아
          아무것도 강조되지 않았고 정작 매일 봐야 할 숫자는 그 아래로 밀렸다. 한 줄 요약만 남기고
          자세한 규칙은 접어 둔다. 지금 조치가 필요한 대기 건수는 접힌 안쪽에 숨기지 않는다. */}
      <GlassCard padding="sm" className="text-xs text-dim leading-relaxed">
        <p>
          통합검색 · 블로그 · 인플루언서 <span className="text-text font-semibold">세 영역을 교차검증</span>해,
          확인에 성공한 영역 전부에서 안 보이는 글만 미노출로 판정합니다.
          {indexingWaitCount > 0 && <span className="text-accent font-semibold"> 색인 대기 {indexingWaitCount}개</span>}
          {recheckCount > 0 && <span className="text-amber-600 font-semibold"> · 재검증 대기 {recheckCount}개</span>}
        </p>
        <details className="mt-1.5 group">
          <summary className="cursor-pointer text-accent list-none select-none">
            판정 기준 자세히 <span className="group-open:hidden">＋</span><span className="hidden group-open:inline">－</span>
          </summary>
          <div className="mt-1.5 space-y-1">
            <p>정상 = 검사한 영역이 모두 노출 · 일부 노출 = 일부만 노출 · 미노출 = 확인에 성공한 영역 전부에서 확인 안 됨. 한 곳이라도 노출되면 미노출이 아니며, 2차 재검증까지 통과한 글만 확정 판정합니다.</p>
            <p>검색 기준은 항상 포스팅 제목(또는 등록한 키워드)이며, 검색 결과의 포스팅 URL·블로그 ID가 내 것과 일치하는지까지 확인합니다.</p>
            <p>검색 오류·요청 실패·네이버 화면 구조 변경으로 결과를 한 건도 읽지 못한 영역은 <span className="text-text">확인 불가</span>로 두고 판정에서 제외하며, 미노출로 집계하지 않습니다. 모든 영역이 확인 불가면 그 글은 미노출로 세지 않습니다.</p>
            <p>발행 후 {INDEXING_GRACE_HOURS}시간 이내 게시글은 네이버 색인 지연으로 인한 오탐을 막기 위해 <span className="text-text">확인 중</span>으로 두고 미노출 집계에서 제외합니다.</p>
          </div>
        </details>
      </GlassCard>

      {/* 2. 전체 현황 카드 — 전체 포스팅 / 노출(정상) / 미노출 / 일부 노출 / 미확인.
          네 상태 카드(노출·미노출·일부노출·미확인) 합 = 전체 포스팅. 로딩 전엔 0을 지어내지 않고 '—' 표시(§13).

          ⚠️ '아직 확인 안 함'을 0으로 단정하지 않는다(§13). 비회원이거나 블로그를 등록하지
          않았으면 조회 자체가 일어나지 않는데, 그때도 카드는 전부 0 을 띄우고 있었다 —
          "미노출 0건"은 좋은 소식처럼 읽히지만 사실은 **아무것도 확인하지 않은 상태**다.
          (postsLoading 은 프로필이 없으면 곧바로 false 가 되므로 loading 만으로는 못 거른다.
           아래 포스팅 목록은 이미 두 경우를 갈라 안내하고 있었다 — 카드만 뒤처져 있었다.) */}
      {/* ⚠️ size="kpi" 카드는 description 을 아예 그리지 않는다(AnimatedStatCard 158~159행 —
          아이콘·label·값만 그린다. 정사각형 variant 에만 stat-desc 줄이 있다). 그래서 카드 안에는
          '확인 전' 다음에 무엇을 하면 되는지 적을 자리가 없다. 공용 카드의 고정 높이(h-[150px])와
          구조를 건드리지 않기 위해, 카드 줄 바로 위에 한 줄로 안내한다. */}
      {notMeasured && (
        notMeasuredStatus === '확인 실패' ? (
          <p className="text-xs text-down">
            포스팅 목록을 불러오지 못해 <b className="font-semibold">노출 현황을 집계하지 못했습니다</b> — 아래 숫자가 0 이 아니라 <b className="font-semibold">‘확인 실패’</b>인 이유입니다. 잠시 후 새로고침해 주세요.
          </p>
        ) : (
          <p className="text-xs text-dim">
            아직 한 건도 확인하지 않았습니다 — <b className="text-text font-semibold">{notMeasuredReason}</b>.
          </p>
        )
      )}
      {/* 카드를 누르면 아래 목록이 그 상태로 걸러진다 — 숫자를 보고 "그게 어떤 글인지" 보려고
          필터를 다시 찾아 누르던 동선을 없앤다. 같은 카드를 다시 누르면 전체로 돌아온다.
          ▲▼ 는 직전 동일 길이 기간 대비 증감이며, 직전 기간에 확정 판정이 없으면 띄우지 않는다. */}
      <SummaryCards
        loading={postsLoading || identityPending}
        activeKey={notMeasured ? undefined : CARD_TO_FILTER_KEY[statusFilter]}
        onSelect={notMeasured ? undefined : key => setStatusFilter(prev => {
          const next = FILTER_BY_CARD[key];
          return prev === next ? 'all' : next;
        })}
        cards={([
          { key: 'total', label: '전체 포스팅', value: periodPosts.length, color: 'accent', description: '선택 기간 발행 글',
            trend: deltaOf(periodPosts.length, prevPeriod?.total), trendTone: 'higher-better',
            title: prevPeriod ? `${periodSpanLabel} ${prevPeriod.total}개 → 이번 기간 ${periodPosts.length}개` : '선택 기간에 발행한 글' },
          { key: 'normal', label: '노출', value: normalCount, color: 'up', description: `${pct(normalCount)}% · 전 영역 노출`,
            trend: comparableExposure ? deltaOf(normalCount, prevPeriod!.normal) : undefined, trendTone: 'higher-better',
            title: `검사한 전 영역에서 노출 확인 (전체의 ${pct(normalCount)}%)${comparableExposure ? ` · ${periodSpanLabel} ${prevPeriod!.normal}개` : ''}` },
          { key: 'missing', label: '미노출', value: missingCount, color: 'down', description: `${pct(missingCount)}% · 확인한 전 영역 미노출`,
            trend: comparableExposure ? deltaOf(missingCount, prevPeriod!.missing) : undefined, trendTone: 'lower-better',
            title: `확인에 성공한 전 영역에서 찾지 못함 (전체의 ${pct(missingCount)}%)${comparableExposure ? ` · ${periodSpanLabel} ${prevPeriod!.missing}개` : ''}` },
          { key: 'partial', label: '일부 노출', value: partialCount, color: 'accent', description: `${pct(partialCount)}% · 일부 영역만`,
            trend: comparableExposure ? deltaOf(partialCount, prevPeriod!.partial) : undefined, trendTone: 'lower-better',
            title: `일부 영역에서만 노출 (전체의 ${pct(partialCount)}%)${comparableExposure ? ` · ${periodSpanLabel} ${prevPeriod!.partial}개` : ''}` },
          // 미확인은 검사를 얼마나 돌렸느냐에 따라 오르내리는 진행 지표라 기간 비교가 뜻을 갖지 않는다.
          { key: 'unknown', label: '미확인', value: unknownCount, color: 'dim', description: '미검사·확인 중·확인 실패',
            title: '아직 검사하지 않았거나, 색인 대기·확인 실패로 판정이 확정되지 않은 글' },
        ] as SummaryCard[]).map(c => notMeasured
          ? { ...c, color: 'dim' as const, statusText: notMeasuredStatus, statusTone: notMeasuredStatus === '확인 실패' ? ('error' as const) : ('neutral' as const), description: notMeasuredReason, trend: undefined, title: notMeasuredReason }
          : c)}
      />

      {/* 3. 필터 · 검색 */}
      <div className="flex flex-col gap-3">
        {/* §12·§13 기간 필터 — 30일 이하는 누구나, 90/120/전체는 회원 전용(🔒). 회원이 선택하면 확장 조회 흐름 시작. */}
        <PeriodFilter
          period={period}
          onPeriod={value => {
            const n = value as Period;
            if (isExtendedPeriod(n)) {
              if (!isMember) { openGate('/my/missing-posts'); return; } // §3·§13 비회원 → 로그인/회원가입
              beginExtended(n);
            } else { setPeriod(n); setCustomFrom(''); setCustomTo(''); }
          }}
          customFrom={customFrom}
          customTo={customTo}
          onCustomFrom={setCustomFrom}
          onCustomTo={setCustomTo}
          usingCustomRange={usingCustomRange}
          onResetCustom={() => { setCustomFrom(''); setCustomTo(''); }}
          lockExtended={!isMember}
          disabled={extendBusy}
          busy={extendBusy}
        />
        {/* §16 이용 기준 안내(작게) */}
        <p className="text-[11px] text-dim">
          최근 {FREE_DAYS}일 기본 조회 · 30일 이전은 <b className="text-text">회원 전용</b> · 대량 조회 시 크레딧이 사용될 수 있습니다.
        </p>
        {/* §3 상태·영역·정렬·검색을 한 줄에 모은다(좁은 화면에서만 접힘) — 예전엔 세 줄로 흩어져 있어
            무엇이 켜져 있는지 보려면 화면 위쪽을 훑어야 했다. 내려받기도 같은 줄에 둔다. */}
        <div className="flex items-center gap-2 flex-wrap">
          <SegmentedFilter
            options={STATUS_FILTERS.map(f => ({ value: f.key, label: f.label }))}
            value={statusFilter}
            onChange={setStatusFilter}
          />
          <PostSearchBar value={searchQuery} onChange={setSearchQuery} placeholder="게시글 제목 검색">
            <select value={areaFilter} onChange={e => setAreaFilter(e.target.value as AreaFilter)} className={selectClass}>
              {AREA_FILTERS.map(f => <option key={f.key} value={f.key}>{f.label}</option>)}
            </select>
            <select value={sortBy} onChange={e => setSortBy(e.target.value as SortKey)} className={selectClass}>
              {SORT_OPTIONS.map(o => <option key={o.key} value={o.key}>{o.label}</option>)}
            </select>
            {teaser ? (
              <Link href={`${SUBSCRIBE_PATH}?required=${requiredPlan}`} className={`${selectClass} flex items-center no-underline`}>
                🔒 CSV 내려받기
              </Link>
            ) : (
              <button type="button" onClick={downloadCsv} disabled={displayList.length === 0} className={`${selectClass} disabled:opacity-40 disabled:cursor-not-allowed`}>
                CSV 내려받기
              </button>
            )}
          </PostSearchBar>
        </div>

        {/* 적용된 필터 칩 — 어떤 조건이 걸려 있는지 한자리에서 보이고, 하나씩 눌러 뺄 수 있다.
            "미노출 0건"처럼 보이는 화면의 진짜 이유가 좁혀 둔 필터인 경우가 많다. */}
        {activeChips.length > 0 && (
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-[11px] text-dim">적용된 필터</span>
            {activeChips.map(chip => (
              <button
                key={chip.key}
                type="button"
                onClick={chip.clear}
                className="h-7 pl-2.5 pr-2 rounded-full bg-accent/10 text-accent text-[11px] font-semibold flex items-center gap-1 hover:bg-accent/20 transition cursor-pointer"
              >
                {chip.label}
                <span aria-label="이 필터 해제" className="text-sm leading-none">×</span>
              </button>
            ))}
            <button type="button" onClick={clearAllFilters} className="h-7 px-2 text-[11px] text-dim hover:text-accent transition cursor-pointer">
              모두 해제
            </button>
          </div>
        )}
      </div>

      {extendError && <p className="text-xs text-down">{extendError}</p>}

      {/* 수집 실패 안내 — 이유·현재 믿을 수 있는 데이터·다음 자동 재시도·할 수 있는 행동을 한자리에 모은다.
          예전엔 한 줄짜리 빨간 문장 하나뿐이라 "그래서 뭘 하면 되나"에 답하지 못했다. */}
      {collectCode && !postsLoading && profile?.blogId && (
        <GlassCard className="p-4 border-l-2 border-l-down">
          <p className="text-sm font-semibold text-text">{COLLECT_FAIL_COPY[collectCode].title}</p>
          <p className="text-xs text-dim leading-relaxed mt-1">{COLLECT_FAIL_COPY[collectCode].detail}</p>

          <div className="mt-2.5 space-y-0.5 text-[11px] text-dim">
            <p>
              마지막 성공 검사:{' '}
              <span className="text-text">{lastSuccessAt ? formatCheckedAt(lastSuccessAt.toISOString()) : '없음'}</span>
              {lastSuccessAt && ' (아래 목록은 이때 저장된 판정입니다)'}
            </p>
            <p>다음 자동 재검사: <span className="text-text">{nextAutoRecheck}</span></p>
            {/* 실패한 검사의 크레딧은 서버(check-missing)가 이미 자동 환불한다.
                화면이 말해주지 않으면 사용자는 차감된 채로 실패했다고 믿는다. */}
            <p>검사가 실패한 건은 차감된 크레딧이 자동으로 환불됩니다.</p>
          </div>

          <div className="mt-3 flex flex-wrap gap-2">
            {COLLECT_FAIL_COPY[collectCode].retry && (
              <button
                type="button"
                onClick={() => fetchPosts(profile.blogId!)}
                className="px-3 py-1.5 rounded-lg bg-accent text-white text-xs font-semibold cursor-pointer"
              >
                다시 시도
              </button>
            )}
            <Link
              href={`https://blog.naver.com/${profile.blogId}`}
              target="_blank"
              rel="noopener noreferrer"
              className="px-3 py-1.5 rounded-lg border border-border text-xs text-dim"
            >
              내 블로그 열어보기
            </Link>
            {(collectCode === 'NO_POSTS' || collectCode === 'UPSTREAM_ERROR') && (
              <Link href="/my/link" className="px-3 py-1.5 rounded-lg border border-border text-xs text-dim">
                연결된 블로그 확인
              </Link>
            )}
          </div>
        </GlassCard>
      )}

      <AnalyticsTableShell
        title="포스팅 목록"
        loading={postsLoading}
        count={
          teaser && lockedCount > 0
            ? `${teaserList.length} / ${displayList.length}개`
            : collapsedCount > 0
              ? `${visibleList.length} / ${displayList.length}개`
              : `${displayList.length}개`
        }
      >

        {postsLoading ? (
          <div className="flex flex-col items-center justify-center py-10 text-dim text-sm gap-1">
            <span className="flex items-center">
              <span className="w-4 h-4 border-2 border-accent/30 border-t-accent rounded-full animate-spin mr-2" />
              포스트를 불러오는 중...
            </span>
            {/* 첫 조회는 네이버를 여러 페이지 크롤링해 수십 초 걸릴 수 있다.
                얼마나 기다려야 하는지 모르면 사용자는 고장으로 읽고 나가버린다. */}
            <span className="text-xs">글이 많은 블로그는 첫 조회에 1분까지 걸릴 수 있습니다.</span>
          </div>
        ) : authError ? (
          // 백엔드 장애 — "블로그 미연결"이나 "비회원"으로 오인 안내하면 안 된다
          <div className="text-center py-10 text-dim text-sm">
            일시적으로 정보를 불러오지 못했습니다.<br />
            <span className="text-xs">서버 상태를 확인 중입니다. 잠시 후 새로고침해주세요.</span>
          </div>
        ) : !isMember ? (
          <div className="text-center py-10 text-dim text-sm">
            로그인 후 내 블로그의 노출 현황을 확인할 수 있습니다.
            <button
              type="button"
              onClick={() => openGate('/my/missing-posts')}
              className="ml-2 text-accent underline cursor-pointer"
            >
              로그인
            </button>
          </div>
        ) : !profile?.blogId ? (
          <div className="text-center py-10 text-dim text-sm">블로그가 연결되지 않았습니다. 프로필에서 블로그를 연결하면 노출 상태 검사가 시작됩니다.</div>
        ) : posts.length === 0 ? (
          // 이유와 행동은 바로 위 수집 실패 안내가 이미 말한다 — 여기서 또 다르게 설명하면
          // 같은 화면 안에서 두 가지 진단이 충돌한다. 목록 자리는 판정 불가만 짚는다.
          <div className="text-center py-10 text-dim text-sm">
            수집된 게시물이 없어 노출 상태를 판정할 수 없습니다.<br />
            <span className="text-xs">자세한 원인과 조치는 위 안내를 확인해 주세요.</span>
          </div>
        ) : periodPosts.length === 0 ? (
          <div className="text-center py-10 text-dim text-sm">선택한 기간에 발행된 포스트가 없습니다. (전체 {posts.length}개 수집됨 — 기간 필터를 넓혀보세요)</div>
        ) : teaserList.length === 0 ? (
          <div className="text-center py-10 text-dim text-sm">
            {/* 티저에선 "없다"가 아니라 "이 범위 밖이라 잠겨 있다"가 맞다.
                조건에 맞는 글이 실제로 있는데 없다고 말하면 사용자가 필터만 계속 만지게 된다. */}
            {teaser && displayList.length > 0
              ? `조건에 맞는 포스팅 ${displayList.length}개가 있지만, 최근 ${MISSING_POSTS_TEASER.days}일 이내 글이 없어 표시할 항목이 없습니다.`
              : statusFilter !== 'all'
                ? '선택한 상태 필터에 해당하는 포스팅이 없습니다. 필터를 "전체"로 바꿔보세요.'
                : searchQuery.trim()
                  ? '검색어와 일치하는 포스팅이 없습니다.'
                  : '표시할 포스팅이 없습니다.'}
          </div>
        ) : (
          <>
            {/* 데스크톱 테이블 */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-sm min-w-[1120px]">
                <thead>
                  <tr className="border-b border-border/50 text-[11px] text-dim">
                    <th className="text-center px-3 py-3 font-semibold w-10">
                      <input type="checkbox" checked={allVisibleSelected} onChange={toggleAll}
                        className="cursor-pointer accent-accent" aria-label="전체 선택" />
                    </th>
                    <th className="text-center px-3 py-3 font-semibold w-12">No.</th>
                    <th className="text-left px-5 py-3 font-semibold">제목</th>
                    <th className="text-left px-3 py-3 font-semibold w-20">카테고리</th>
                    <th className="text-right px-3 py-3 font-semibold w-24">발행일</th>
                    <th className="text-center px-2 py-3 font-semibold w-24">통합검색</th>
                    <th className="text-center px-2 py-3 font-semibold w-24">블로그</th>
                    <th className="text-center px-2 py-3 font-semibold w-24">인플루언서</th>
                    <th className="text-right px-2 py-3 font-semibold w-20">검색량</th>
                    <th className="text-left px-3 py-3 font-semibold w-24">상태</th>
                    <th className="text-right px-3 py-3 font-semibold w-28">마지막 확인</th>
                    <th className="text-center px-5 py-3 font-semibold w-28">관리</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/20">
                  {visibleList.map((post, idx) => {
                    const mr = missingResults[post.id];
                    const isChecking = checkingPostId === post.id;
                    const now = Date.now();
                    return (
                      <tr key={post.id} className="hover:bg-surface-hover transition">
                        <td className="px-3 py-3.5 text-center">
                          <input type="checkbox" checked={selectedIds.has(post.id)} onChange={() => toggleOne(post.id)}
                            className="cursor-pointer accent-accent" aria-label={`${post.title} 선택`} />
                        </td>
                        <td className="px-3 py-3.5 text-center text-dim text-xs font-rank">{idx + 1}</td>
                        <td className="px-5 py-3.5">
                          <span className="font-semibold truncate block max-w-[280px]" title={post.title}>{post.title}</span>
                        </td>
                        <td className="px-3 py-3.5 text-dim text-xs">{post.category || '—'}</td>
                        <td className="px-3 py-3.5 text-right text-dim text-xs">{post.date}</td>
                        <td className="px-2 py-3.5 text-center"><ExposureBadge exposed={mr?.viewTab.exposed} post={post} mr={mr} now={now} area="view" /></td>
                        <td className="px-2 py-3.5 text-center"><ExposureBadge exposed={mr?.blogTab.exposed} post={post} mr={mr} now={now} area="blog" /></td>
                        <td className="px-2 py-3.5 text-center"><ExposureBadge exposed={mr?.influencerTab?.exposed} post={post} mr={mr} now={now} area="influencer" /></td>
                        <td className="px-2 py-3.5 text-right text-dim text-xs">{mr?.searchVolume != null ? mr.searchVolume.toLocaleString() : '—'}</td>
                        <td className="px-3 py-3.5"><StatusBadge post={post} mr={mr} isChecking={isChecking} now={now} /></td>
                        <td className="px-3 py-3.5 text-right text-[11px] text-dim whitespace-nowrap">{mr?.checkedAt ? formatCheckedAt(mr.checkedAt) : '—'}</td>
                        <td className="px-5 py-3.5 text-center">
                          <div className="flex items-center justify-center gap-2">
                            <button
                              onClick={() => { setDetailPostId(post.id); setDetailError(''); }}
                              className="text-dim hover:text-accent hover:underline text-xs font-semibold cursor-pointer"
                            >
                              상세
                            </button>
                            <button
                              onClick={() => recheckSingle(post)}
                              disabled={teaser || checkingAll || isChecking}
                              className="text-dim hover:text-accent hover:underline text-xs font-semibold cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                            >
                              {isChecking ? '검사 중' : '다시 검사'}
                            </button>
                            <a href={post.url} target="_blank" rel="noopener noreferrer" className="text-accent hover:underline text-xs font-semibold">보기</a>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* 모바일 카드 */}
            <div className="md:hidden divide-y divide-border/20">
              {visibleList.map((post, idx) => {
                const mr = missingResults[post.id];
                const isChecking = checkingPostId === post.id;
                const now = Date.now();
                return (
                  <div key={post.id} className="p-4 space-y-2">
                    <div className="flex items-start gap-2">
                      <input type="checkbox" checked={selectedIds.has(post.id)} onChange={() => toggleOne(post.id)}
                        className="cursor-pointer accent-accent mt-1 shrink-0" aria-label={`${post.title} 선택`} />
                      <span className="text-dim text-xs font-rank mt-0.5 shrink-0">{idx + 1}.</span>
                      <p className="font-semibold text-sm truncate flex-1" title={post.title}>{post.title}</p>
                      <StatusBadge post={post} mr={mr} isChecking={isChecking} now={now} />
                    </div>
                    <div className="flex items-center justify-between text-xs text-dim">
                      <span>{post.category || '—'}</span>
                      <span>{post.date}</span>
                    </div>
                    <div className="grid grid-cols-3 gap-1.5">
                      <div className="text-center"><p className="text-[9px] text-dim mb-0.5">통합검색</p><ExposureBadge exposed={mr?.viewTab.exposed} post={post} mr={mr} now={now} area="view" /></div>
                      <div className="text-center"><p className="text-[9px] text-dim mb-0.5">블로그</p><ExposureBadge exposed={mr?.blogTab.exposed} post={post} mr={mr} now={now} area="blog" /></div>
                      <div className="text-center"><p className="text-[9px] text-dim mb-0.5">인플루언서</p><ExposureBadge exposed={mr?.influencerTab?.exposed} post={post} mr={mr} now={now} area="influencer" /></div>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] text-dim">{mr?.checkedAt ? `${formatCheckedAt(mr.checkedAt)} 확인` : '미확인'}</span>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => { setDetailPostId(post.id); setDetailError(''); }}
                          className="text-dim hover:text-accent hover:underline text-xs font-semibold cursor-pointer"
                        >
                          상세
                        </button>
                        <button
                          onClick={() => recheckSingle(post)}
                          disabled={teaser || checkingAll || isChecking}
                          className="text-dim hover:text-accent hover:underline text-xs font-semibold cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                        >
                          {isChecking ? '검사 중' : '다시 검사'}
                        </button>
                        <a href={post.url} target="_blank" rel="noopener noreferrer" className="text-accent hover:underline text-xs font-semibold">보기</a>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* 첫 화면은 최근 10개 — 나머지는 여기서 펼친다. 목록은 이미 받아둔 것이라 다시 부르지 않는다. */}
            {collapsedCount > 0 && (
              <div className="px-5 py-4 border-t border-border/40 text-center">
                <button
                  onClick={() => setShowAllRecent(true)}
                  className="px-4 py-2 border border-border text-text font-semibold rounded-xl hover:bg-surface-hover transition cursor-pointer text-xs"
                >
                  더 보기 ({collapsedCount}개)
                </button>
                <p className="text-[11px] text-dim mt-2">최근 {MISSING_POSTS_RECENT_LIMIT}개 글을 먼저 보여드립니다.</p>
              </div>
            )}
          </>
        )}
      </AnalyticsTableShell>

      {/* 티저 잠금 안내 — 표 바로 아래에 둔다. 잠긴 건수를 실제 숫자로 말해야
          "몇 개가 더 있는지"가 전달되고, 그게 업그레이드를 판단할 근거가 된다. */}
      {teaser && !postsLoading && lockedCount > 0 && (
        <GlassCard padding="sm">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="space-y-1">
              <p className="text-sm font-bold text-text">
                포스팅 {lockedCount}개가 더 있습니다
              </p>
              <p className="text-xs text-dim leading-relaxed">
                최근 {MISSING_POSTS_TEASER.days}일 · {MISSING_POSTS_TEASER.rows}건까지 무료로 확인할 수 있습니다.
                {planLabel(requiredPlan)} 이용권을 시작하면 전체 포스팅의 3탭 교차검증 판정과
                노출↔미노출 전환 이력, 30일 이전 글 조회까지 이용할 수 있습니다.
              </p>
            </div>
            <Link
              href={`${SUBSCRIBE_PATH}?required=${requiredPlan}`}
              className="shrink-0 px-4 py-2.5 bg-accent text-white font-bold rounded-xl hover:bg-accent-hover transition text-xs text-center"
            >
              {planLabel(requiredPlan)} 이용권 보기
            </Link>
          </div>
        </GlassCard>
      )}

      {/* 4. 상세뷰(원인분석) 패널 */}
      <Modal open={!!detailPost} onClose={closeDetail} overlayClassName="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 p-4">
        {detailPost && (
          <div className="bg-surface rounded-lg border border-border shadow-lg w-full max-w-lg mx-4 p-6 max-h-[85vh] overflow-y-auto">
            {/* 헤더 */}
            <div className="flex items-start justify-between mb-4 gap-3">
              <div>
                <h3 className="font-bold text-base leading-snug">{detailPost.title}</h3>
                <p className="text-[11px] text-dim mt-1">{detailPost.category || '—'} · {detailPost.date}</p>
              </div>
              <button onClick={closeDetail} className="text-dim hover:text-text transition cursor-pointer text-lg shrink-0">&times;</button>
            </div>

            {/* 노출 현황 */}
            <div className="grid grid-cols-3 gap-2 mb-4">
              {([
                { label: '통합검색', exposed: detailMr?.viewTab.exposed, rank: detailMr?.viewTab.rank, area: 'view' },
                { label: '블로그탭', exposed: detailMr?.blogTab.exposed, rank: detailMr?.blogTab.rank, area: 'blog' },
                { label: '인플루언서탭', exposed: detailMr?.influencerTab?.exposed, rank: detailMr?.influencerTab?.rank, area: 'influencer' },
              ] as const).map(a => (
                <div key={a.label} className="bg-bg rounded-lg px-2.5 py-2 text-center">
                  <p className="text-[10px] text-dim mb-1">{a.label}</p>
                  <ExposureBadge exposed={a.exposed} mr={detailMr} area={a.area} />
                  {a.rank != null && <p className="text-[10px] text-dim mt-1">{a.rank}위</p>}
                </div>
              ))}
            </div>

            {/* §14/§19 최종 판정 + 신뢰도 + 1·2차 검사 시각 */}
            {detailVerdict && (
              <div className="bg-bg rounded-lg px-3 py-2.5 mb-4 space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-dim">최종 판정</span>
                  <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${VERDICT_STYLE[detailVerdict]}`}>
                    {verdictLabel(detailVerdict).emoji} {verdictLabel(detailVerdict).text}
                  </span>
                </div>
                {detailVerdict === 'missing' && (
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-dim">판정 신뢰도</span>
                    <span className="text-xs font-semibold text-text">{confidenceLabel(detailMr?.confidence ?? null)}</span>
                  </div>
                )}
                {detailVerdict === 'recheck' && (
                  <p className="text-[11px] text-amber-600">모든 영역 미노출이 1회 감지되어 재검증 대기 중입니다. 2차 검사에서도 동일하면 미노출로 확정됩니다.</p>
                )}
                {detailMr?.firstAllMissingAt && (
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-dim">1차 검사(최초 미노출 감지)</span>
                    <span className="text-[11px] text-dim">{formatCheckedAt(detailMr.firstAllMissingAt)}</span>
                  </div>
                )}
                {detailMr?.checkedAt && (
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-dim">최근 검사</span>
                    <span className="text-[11px] text-dim">{formatCheckedAt(detailMr.checkedAt)}</span>
                  </div>
                )}
                {detailMr?.evidence?.reverified && (
                  <p className="text-[11px] text-dim pt-0.5">
                    ✓ 이번 검사에서 2차 재검증을 수행했습니다{detailMr.evidence.reverifyFlippedToExposed ? ' — 재검증에서 노출로 정정됨.' : '.'}
                  </p>
                )}
                {detailMr?.evidence?.keywordUncertain && (
                  <p className="text-[11px] text-amber-600 pt-0.5">
                    ◐ 대표 키워드를 확정하지 못해 제목 기반 검색어로 검사했습니다. 판정 자체는 유효하지만, 대표 키워드를 직접 지정하면 더 정확해집니다.
                  </p>
                )}
              </div>
            )}

            <div className="text-xs text-dim bg-bg rounded-lg px-3 py-2 mb-4 space-y-1">
              <p>검색 기준: <b className="text-text">포스팅 제목</b></p>
              {detailMr?.candidates && detailMr.candidates.length > 0 && (
                <p className="leading-relaxed">
                  검색 후보: {detailMr.candidates.map((c, i) => (
                    <span key={i} className="inline-block bg-surface border border-border rounded px-1.5 py-0.5 mr-1 mt-1 text-text">{c}</span>
                  ))}
                </p>
              )}
              <p>검색량: <b className="text-text">{detailMr?.searchVolume != null ? detailMr.searchVolume.toLocaleString() : '—'}</b></p>
            </div>

            {/* 원인 분석 */}
            <div className="mb-4">
              <p className="font-bold text-xs mb-2">원인 분석 (추정)</p>
              <ul className="space-y-1.5">
                {detailCauses.map((c, i) => (
                  <li key={i} className="text-xs text-dim leading-relaxed flex gap-1.5">
                    <span className="text-accent shrink-0">·</span>
                    <span>{c}</span>
                  </li>
                ))}
              </ul>
            </div>

            {/* 노출/미노출 전환 이력 (§7) */}
            <div className="mb-4">
              <p className="font-bold text-xs mb-2">노출 변화 이력</p>
              {teaser ? (
                // 티저에서는 이력 API 가 403 이라 응답이 늘 빈 배열이다. 그대로 두면
                // "전환이 없습니다"라는 사실과 다른 문장이 나가므로 잠금 안내로 갈라준다.
                <p className="text-xs text-dim leading-relaxed">
                  노출↔미노출 전환 이력은{' '}
                  <Link href={`${SUBSCRIBE_PATH}?required=${requiredPlan}`} className="text-accent font-semibold underline underline-offset-2">
                    {planLabel(requiredPlan)} 이용권
                  </Link>
                  부터 확인할 수 있습니다.
                </p>
              ) : historyLoading ? (
                <p className="text-xs text-dim">이력을 불러오는 중...</p>
              ) : detailHistory.length === 0 ? (
                <p className="text-xs text-dim">아직 기록된 노출↔미노출 전환이 없습니다. 재검사로 상태가 바뀌면 여기에 기록됩니다.</p>
              ) : (
                <ul className="space-y-1.5">
                  {detailHistory.map((h, i) => (
                    <li key={i} className="text-xs">
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] text-dim w-28 shrink-0">{formatCheckedAt(h.changedAt)}</span>
                        <ExposureBadge exposed={h.prevState === 'exposed'} />
                        <span className="text-dim">→</span>
                        <ExposureBadge exposed={h.newState === 'exposed'} />
                      </div>
                      {h.changedReason && <p className="text-[10px] text-dim mt-0.5 ml-[120px] leading-snug">{h.changedReason}</p>}
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {/* 재검사 */}
            <div className="bg-bg rounded-lg p-3">
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs text-dim">포스팅 제목 기준으로 다시 검사합니다.</p>
                <button
                  onClick={() => detailPost && recheckDetail(detailPost)}
                  disabled={detailChecking}
                  className="px-3 py-2 bg-accent text-white font-bold rounded-lg hover:bg-accent-hover transition cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed text-xs shrink-0"
                >
                  {detailChecking ? '검사 중...' : '재검사'}
                </button>
              </div>
              {detailError && <p className="text-xs text-down mt-2">{detailError}</p>}
              {detailMr?.checkedAt && <p className="text-[10px] text-dim mt-2">최근 검사 {formatCheckedAt(detailMr.checkedAt)}</p>}
            </div>

            <button
              onClick={closeDetail}
              className="w-full mt-4 px-4 py-2.5 rounded-lg text-xs font-semibold bg-bg border border-border text-dim hover:border-accent/30 transition-colors cursor-pointer"
            >
              닫기
            </button>
          </div>
        )}
      </Modal>

      {/* 5. 대량 분석 비용 안내 확인 (§9~13) */}
      <Modal open={!!confirmBatch} onClose={() => setConfirmBatch(null)} overlayClassName="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 p-4">
        {confirmBatch && (
          <div className="bg-surface rounded-lg border border-border shadow-lg w-full max-w-md mx-4 p-6">
            <h3 className="font-bold text-base mb-3">미노출 대량 분석 안내</h3>
            <div className="text-xs text-dim leading-relaxed space-y-2">
              <p>
                이번 분석에서 새로 검색할 포스팅: <b className="text-text">{confirmBatch.toCheck}개</b>
                {' '}(최근 검사된 글·비공개 글은 제외)
              </p>
              <p>
                예상 검색 요청: <b className="text-text">약 {confirmBatch.toCheck}회 이상</b> — 글마다 <b className="text-text">통합검색 · 블로그 · 인플루언서</b>를 각각 조회하므로 실제 외부 요청은 이보다 많을 수 있습니다.
              </p>
              <p className="p-2.5 rounded-lg bg-amber-500/10 text-amber-700">
                포스팅 수가 많을수록 네이버 검색·검색량 API 등 외부 데이터 조회량이 증가하며, 이용 중인 API 정책에 따라 <b>비용이 발생할 수 있습니다.</b>
                {confirmBatch.toCheck > 50 && ' 특히 50개를 초과하는 대량 분석은 소량으로 나눠 진행하는 것을 권장합니다.'}
              </p>
            </div>
            <div className="flex items-center justify-end gap-2 mt-5">
              <button onClick={() => setConfirmBatch(null)}
                className="px-4 py-2 rounded-lg text-xs font-semibold bg-bg border border-border text-dim hover:border-accent/30 transition-colors cursor-pointer">
                취소
              </button>
              <button onClick={() => { const c = confirmBatch; setConfirmBatch(null); runBatch(c.targets, { force: c.force }); }}
                className="px-4 py-2 rounded-lg text-xs font-bold bg-accent text-white hover:bg-accent-hover transition cursor-pointer">
                분석 시작
              </button>
            </div>
          </div>
        )}
      </Modal>

      {/* §2 "이전 포스팅도 확인하시겠습니까?" 진입 프롬프트 — 최근 30일 완료 + 30일 이전 글 존재 시 */}
      <Modal open={showMorePrompt} onClose={() => { morePromptDismissedRef.current = true; setShowMorePrompt(false); }} overlayClassName="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 p-4">
        <div className="bg-surface rounded-lg border border-border shadow-lg w-full max-w-md mx-4 p-6">
          <h3 className="font-bold text-base mb-3">이전 포스팅도 확인하시겠습니까?</h3>
          <div className="text-xs text-dim leading-relaxed space-y-2">
            <p>최근 {FREE_DAYS}일 포스팅의 노출 상태 확인이 완료되었습니다.</p>
            <p>{FREE_DAYS}일 이전 포스팅도 계속 확인할 수 있습니다. {FREE_DAYS}일 이전 데이터 조회는 <b className="text-text">회원 전용</b> 기능입니다.</p>
            <div className="flex gap-4 pt-1">
              <span>현재 확인 완료: <b className="text-text">{normalCount + partialCount + missingCount}개</b></span>
              <span>추가 확인 가능: <b className="text-text">{olderCount}개</b></span>
            </div>
          </div>
          <div className="flex items-center justify-end gap-2 mt-5">
            <button onClick={() => { morePromptDismissedRef.current = true; setShowMorePrompt(false); }}
              className="px-4 py-2 rounded-lg text-xs font-semibold bg-bg border border-border text-dim hover:border-accent/30 transition-colors cursor-pointer">
              여기까지만 보기
            </button>
            <button disabled={extendBusy}
              onClick={() => { setShowMorePrompt(false); if (!isMember) { openGate('/my/missing-posts'); return; } beginExtended(0, { fromPrompt: true }); }}
              className="px-4 py-2 rounded-lg text-xs font-bold bg-accent text-white hover:bg-accent-hover transition cursor-pointer disabled:opacity-50">
              이전 포스팅 더 확인하기
            </button>
          </div>
        </div>
      </Modal>

      {/* §6 크레딧 안내 / §2 무료 대량 확인 / §8 크레딧 부족 — 확장 조회 게이트 */}
      <Modal open={!!extendModal} onClose={() => setExtendModal(null)} overlayClassName="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 p-4">
        {extendModal && (extendModal.phase === 'credit' || extendModal.phase === 'confirm') && (
          <div className="bg-surface rounded-lg border border-border shadow-lg w-full max-w-md mx-4 p-6">
            <h3 className="font-bold text-base mb-3">
              {extendModal.phase === 'credit' ? '추가 조회에 크레딧이 필요합니다' : '이전 포스팅을 확인합니다'}
            </h3>
            <div className="text-xs text-dim leading-relaxed space-y-2">
              <p>이번에 새로 확인할 포스팅: <b className="text-text">{extendModal.plan.newChecks}개</b>
                {extendModal.plan.cached > 0 && <span className="text-dim"> (이미 확인된 {extendModal.plan.cached}개 제외)</span>}</p>
              {extendModal.phase === 'credit' ? (
                <div className="p-2.5 rounded-lg bg-bg space-y-1">
                  <div className="flex justify-between"><span>회원 기본(무료) 조회</span><b className="text-text">{extendModal.plan.freeLimit}개</b></div>
                  <div className="flex justify-between"><span>추가(크레딧) 조회</span><b className="text-text">{extendModal.plan.chargeable}개</b></div>
                  <div className="flex justify-between"><span>사용 예정 크레딧</span><b className="text-accent">{extendModal.plan.estCredits} 크레딧</b></div>
                  <div className="flex justify-between border-t border-border pt-1 mt-1"><span>현재 보유 크레딧</span><b className="text-text">{extendModal.plan.balance} 크레딧</b></div>
                </div>
              ) : (
                <p className="p-2.5 rounded-lg bg-amber-500/10 text-amber-700">글마다 통합검색·블로그·인플루언서를 조회하므로 다소 시간이 걸릴 수 있습니다. 무료 조회 범위({extendModal.plan.freeLimit}개) 내라 크레딧은 차감되지 않습니다.</p>
              )}
            </div>
            <div className="flex items-center justify-end gap-2 mt-5">
              <button onClick={() => setExtendModal(null)}
                className="px-4 py-2 rounded-lg text-xs font-semibold bg-bg border border-border text-dim hover:border-accent/30 transition-colors cursor-pointer">
                취소
              </button>
              <button disabled={extendBusy}
                onClick={() => { const m = extendModal; if (m.phase === 'credit' || m.phase === 'confirm') runExtended(m.candidates); }}
                className="px-4 py-2 rounded-lg text-xs font-bold bg-accent text-white hover:bg-accent-hover transition cursor-pointer disabled:opacity-50">
                {extendModal.phase === 'credit' ? '크레딧 사용하고 계속' : '이전 포스팅 더 확인하기'}
              </button>
            </div>
          </div>
        )}
        {extendModal && extendModal.phase === 'insufficient' && (
          <div className="bg-surface rounded-lg border border-border shadow-lg w-full max-w-sm mx-4 p-6">
            <h3 className="font-bold text-base mb-3">크레딧이 부족합니다</h3>
            <div className="text-xs text-dim leading-relaxed space-y-1">
              <div className="flex justify-between"><span>필요 크레딧</span><b className="text-text">{extendModal.required}</b></div>
              <div className="flex justify-between"><span>현재 크레딧</span><b className="text-text">{extendModal.balance}</b></div>
              <p className="pt-1 text-down font-semibold">{Math.max(0, extendModal.required - extendModal.balance)} 크레딧이 부족합니다.</p>
            </div>
            <div className="flex items-center justify-end gap-2 mt-5">
              <button onClick={() => setExtendModal(null)}
                className="px-4 py-2 rounded-lg text-xs font-semibold bg-bg border border-border text-dim hover:border-accent/30 transition-colors cursor-pointer">
                취소
              </button>
              <button onClick={() => { setExtendModal(null); router.push('/subscribe'); }}
                className="px-4 py-2 rounded-lg text-xs font-bold bg-accent text-white hover:bg-accent-hover transition cursor-pointer">
                크레딧 충전하기
              </button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
