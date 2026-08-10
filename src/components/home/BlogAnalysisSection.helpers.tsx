import GoogleLoginButton from '@/components/auth/GoogleLoginButton';
import AnimatedStatCard from '@/components/dashboard/AnimatedStatCard';
import GlassCard from '@/components/dashboard/GlassCard';

export interface BloggerProfile {
  blogId: string;
  /** 로그인 계정 식별자 — 동일 blogId를 다른 계정이 조회해도 로컬 캐시가 섞이지 않도록 키에 포함 */
  accountId?: string;
  displayName: string;
  isInfluencer: boolean;
  imageUrl?: string;
  needsBlogId?: boolean;
  subscriptionPlan?: string | null;
  subscriptionExpiresAt?: string | null;
}

export interface BlogPost {
  id: string;
  title: string;
  url: string;
  commentCount: number;
  viewCount?: number;
  date: string;
  isPublic: boolean;
  category?: string;
}

export interface AiBriefingResult {
  hasAiBriefing: boolean | null;
  exposed: boolean | null;
  hasAiTab: boolean | null;
  tabExposed: boolean | null;
}

/** API가 응답 없이 멈춰도 무한 로딩에 빠지지 않도록 요청마다 타임아웃을 건다 */
export async function fetchWithTimeout(input: string, init?: RequestInit, timeoutMs = 10000): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(input, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

export async function fetchAiBriefingState(blogId: string): Promise<Record<string, AiBriefingResult>> {
  const res = await fetch(`/api/my/ai-briefing-state?blogId=${encodeURIComponent(blogId)}`);
  if (!res.ok) throw new Error('AI 브리핑 상태 조회 실패');
  const data = await res.json();
  return (data?.briefingResults ?? {}) as Record<string, AiBriefingResult>;
}

/** "postId::keyword" 키 결과를 postId 단위로 합산 — 하나라도 인용/노출이면 해당 포스트는 인용/노출로 표시 */
export function aggregateByPost(byKeyword: Record<string, AiBriefingResult>): Record<string, { briefing: 'cited' | 'notCited' | 'unchecked'; tab: 'exposed' | 'notExposed' | 'unchecked' }> {
  const byPost: Record<string, { briefingChecked: boolean; briefingCited: boolean; tabChecked: boolean; tabExposed: boolean }> = {};
  for (const [key, r] of Object.entries(byKeyword)) {
    const postId = key.includes('::') ? key.split('::')[0] : key;
    const entry = byPost[postId] ??= { briefingChecked: false, briefingCited: false, tabChecked: false, tabExposed: false };
    if (r.exposed !== null) {
      entry.briefingChecked = true;
      if (r.exposed) entry.briefingCited = true;
    }
    if (r.tabExposed !== null) {
      entry.tabChecked = true;
      if (r.tabExposed) entry.tabExposed = true;
    }
  }
  const result: Record<string, { briefing: 'cited' | 'notCited' | 'unchecked'; tab: 'exposed' | 'notExposed' | 'unchecked' }> = {};
  for (const [postId, e] of Object.entries(byPost)) {
    result[postId] = {
      briefing: !e.briefingChecked ? 'unchecked' : e.briefingCited ? 'cited' : 'notCited',
      tab: !e.tabChecked ? 'unchecked' : e.tabExposed ? 'exposed' : 'notExposed',
    };
  }
  return result;
}

export interface MissingResult {
  blogTab: { exposed: boolean | null; rank: number | null };
  viewTab: { exposed: boolean | null; rank: number | null };
  searchVolume?: number;
  status?: 'ok' | 'failed';
  checkedAt?: string | null;
}

// 검사 결과 캐시 신선도 — 이 시간 이내에 성공(ok) 검사된 포스트는 재검사를 건너뛴다 (새 글/수정 글만 재검사)
export const CHECK_FRESH_MS = 24 * 60 * 60 * 1000;

export interface BlogScoreData {
  total_score: number;
  grade: string;
  rank: number;
  totalBloggers: number;
  categoryRank: number;
  categoryTotal: number;
  category: string;
}

export interface BlogAnalysisMetrics {
  postsWithImages: number;
  longPosts: number;
  postsWithHeadings: number;
  avgCharCount: number;
  postsWithMedia: number;
  originalImageRatio: number;
  avgImageSizeKB: number;
  postsWithOriginalImages: number;
  avgPersonalPronounRatio: number;
  avgUniqueWordRatio: number;
  postsWithLists: number;
  postsWithQuotations: number;
}

export interface BlogAnalysisAverages {
  charCount: number;
  wordCount: number;
  imageCount: number;
  videoCount: number;
  paragraphCount: number;
  linkCount: number;
  headingCount: number;
  personalPronounCount: number;
  uniqueWordRatio: number;
  listItemCount: number;
  quotationCount: number;
}

// 네이버 공식 블로그 주제 분류
export const CATEGORIES = [
  // 엔터테인먼트·예술
  '문학·책', '영화', '미술·디자인', '공연·전시', '음악', '드라마', '스타·연예인', '만화·애니', '방송',
  // 생활·노하우·쇼핑
  '일상·생각', '육아·결혼', '반려동물', '좋은글·이미지', '패션·미용', '인테리어·DIY', '요리·레시피', '상품리뷰', '원예·재배',
  // 취미·여가·여행
  '게임', '스포츠', '사진', '자동차', '취미', '국내여행', '세계여행', '맛집',
  // 지식·동향
  'IT·컴퓨터', '사회·정치', '건강·의학', '비즈니스·경제', '어학·외국어', '교육·학문',
  // 기타
  '주제선택안함',
];

export async function getProfileFromApi(): Promise<BloggerProfile | null> {
  try {
    // Supabase 세션 토큰을 Bearer로 전달
    let headers: Record<string, string> = {};
    try {
      const { createSupabaseBrowserClient } = await import('@/lib/supabase-browser');
      const supabase = createSupabaseBrowserClient();
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.access_token) {
        headers = { Authorization: `Bearer ${session.access_token}` };
      }
    } catch { /* ignore */ }

    const res = await fetch('/api/auth/me', { headers });
    const data = await res.json();
    const sub = {
      subscriptionPlan: data.subscriptionPlan ?? null,
      subscriptionExpiresAt: data.subscriptionExpiresAt ?? null,
    };
    const accountId: string | undefined = data.authId || data.id || undefined;
    if (data.type === 'unified' && (data.blogId || data.id)) {
      return { blogId: data.blogId || data.id, accountId, displayName: data.name || data.blogId || data.id, isInfluencer: true, ...sub };
    }
    if (data.type === 'blogger' && data.id) {
      return { blogId: data.id, accountId, displayName: data.name || data.id, isInfluencer: false, ...sub };
    }
    if (data.type === 'influencer' && data.id) {
      return { blogId: data.blogId || data.id, accountId, displayName: data.name || data.id, isInfluencer: true, needsBlogId: !data.blogId, ...sub };
    }

    // API 인증 실패 시 URL의 blogId 파라미터 폴백
    const urlParams = new URLSearchParams(window.location.search);
    const blogIdParam = urlParams.get('blogId');
    if (blogIdParam) {
      return { blogId: blogIdParam, displayName: blogIdParam, isInfluencer: false };
    }

    return null;
  } catch { return null; }
}

// 한국어 조사 제거: "블로그의" → "블로그", "미래는" → "미래"
function stripParticles(word: string): string {
  // 2글자 조사부터 (긴 것 먼저)
  const particles2 = ['에서','에게','으로','처럼','만큼','부터','까지','마저','조차','이란','이라','에는','에도','으로서'];
  for (const p of particles2) {
    if (word.length > p.length + 1 && word.endsWith(p)) return word.slice(0, -p.length);
  }
  // 1글자 조사
  const particles1 = ['의','에','를','을','이','가','는','은','와','과','도','로','만','란','라','며','면','야'];
  for (const p of particles1) {
    if (word.length > 2 && word.endsWith(p)) return word.slice(0, -p.length);
  }
  return word;
}

// 포스팅 제목에서 핵심 키워드 추출 (복합어 분해 + 접미어 추출)
export function extractKeywords(title: string, blogId: string, displayName?: string): string[] {
  let cleaned = title;
  // 1. blogId + displayName + 닉네임 변형 제거
  const removePatterns = [blogId, blogId.replace(/[_-]/g, '')];
  if (displayName && displayName.length >= 2) {
    removePatterns.push(displayName);
    if (displayName.length >= 4) {
      removePatterns.push(displayName.slice(0, Math.ceil(displayName.length / 2)));
    }
  }
  const nameSuffixes = ['단상', '도서관', '지음', '블로그', '일기', '기록', '이야기', '스토리'];
  for (const p of removePatterns) {
    if (p.length >= 2) cleaned = cleaned.replace(new RegExp(p, 'gi'), ' ');
  }
  for (const s of nameSuffixes) {
    if (displayName && cleaned.toLowerCase().includes(displayName.slice(0, 3).toLowerCase() + s)) {
      cleaned = cleaned.replace(new RegExp(displayName.slice(0, 3) + s, 'gi'), ' ');
    }
  }
  // 2. 괄호 제거
  cleaned = cleaned.replace(/\([^)]*\)/g, ' ').replace(/\[[^\]]*\]/g, ' ');
  // 3. 특수문자 제거 + 분리 (복합어는 분리하지 않고 원형 유지)
  const rawWords = cleaned.replace(/[^\p{L}\p{N}\s]/gu, ' ').split(/\s+/).filter(Boolean);

  // 3.5. 의로 끝나는 단어 + 짧은 다음 단어 합치기 (책 제목 보존: 장사의 신 → 장사의신)
  const mergedWords: string[] = [];
  for (let i = 0; i < rawWords.length; i++) {
    const word = rawWords[i];
    const next = rawWords[i + 1];
    if (/[가-힣]의$/.test(word) && next && /^[가-힣]{1,3}$/.test(next)) {
      mergedWords.push(word + next);
      i++;
    } else {
      mergedWords.push(word);
    }
  }

  // 4. 키워드 추출 + 접미어 분해
  const stop = new Set(['의','에','를','을','이','가','는','은','와','과','도','로','으로','에서','에게','한','된','하는','있는','없는','대한','위한','통한','그리고','또는','하지만','그러나','때문에','그래서','관련','관련한','관련된','대해','대해서','과연','입장글','입장','TOP','VS','BEST','추천','정리','모음','총정리','후기','리뷰','비교','분석','방법','소개','안내','단상','지음','中','및','더','각','수','것','중','좋은','나쁜','많은','적은','새로운']);
  const result: string[] = [];
  const seen = new Set<string>();

  function add(kw: string) {
    const k = kw.trim();
    if (k.length >= 2 && !seen.has(k) && !stop.has(k)) {
      result.push(k);
      seen.add(k);
    }
  }

  // 접미어 키워드 패턴 (의미 있는 검색어가 되는 것만)
  const kwSuffixes = ['글귀', '명대사', '명언'];

  for (const raw of mergedWords) {
    if (raw.length < 2 || /^\d+$/.test(raw) || stop.has(raw)) continue;

    if (/^[가-힣]{4,}$/.test(raw)) {
      // 원형 보존 (책 제목 등 분리하지 않음)
      add(raw);

      // 접미어 추출 (짧고좋은글귀 → 좋은글귀, 글귀)
      for (const suf of kwSuffixes) {
        if (raw.endsWith(suf) && raw.length > suf.length + 1) {
          const prefix = raw.slice(0, -suf.length);
          for (const p of ['고', '과', '와']) {
            const pidx = prefix.lastIndexOf(p);
            if (pidx >= 1) {
              const mid = prefix.slice(pidx + 1) + suf;
              if (mid.length >= 3) add(mid);
            }
          }
          add(suf);
        }
      }
    } else {
      // 짧은 단어: 조사 제거 후 추가
      const stripped = /^[가-힣]+$/.test(raw) ? stripParticles(raw) : raw;
      if (stripped.length >= 2 && !stop.has(stripped) && !/^[a-zA-Z]$/.test(stripped)) {
        add(stripped);
      }
    }
  }

  return result.slice(0, 6);
}

/** 비로그인 게스트용 블로그 분석 대시보드 — 레이아웃은 실데이터 화면과 동일하게 유지하고
 * KPI 카드·그래프·포스팅 목록은 Empty State, 프로필 영역은 로그인 유도로 대체.
 * 게스트 상태에서는 어떤 사용자 데이터 API도 호출하지 않는다. */
export function GuestBlogAnalysis() {
  const loginRedirect = '/my/blogger';
  const features = ['방문자 분석', '키워드 순위', 'AI 브리핑', '포스팅 분석', '인플루언서 분석'];
  // 오늘 방문자·30일 방문자수·이웃수는 실데이터 화면에서 상단 KPI 요약(BlogDashboardKpiBar)에 속하고,
  // 나머지는 이 섹션의 Statistics 3칸 그리드에 속함 — 게스트 빈 상태도 같은 사이즈 체계를 따른다.
  const statCards: { label: string; size: 'kpi' | 'stat' }[] = [
    { label: '오늘 방문자', size: 'kpi' },
    { label: '30일 방문자수', size: 'kpi' },
    { label: '이웃수', size: 'kpi' },
    { label: '이번주 발행', size: 'stat' },
    { label: '한달 발행', size: 'stat' },
    { label: '통합검색 평균순위', size: 'stat' },
    { label: '블로그탭 평균순위', size: 'stat' },
    { label: '누락율', size: 'stat' },
    { label: '전체 순위', size: 'stat' },
    { label: '카테고리 순위', size: 'stat' },
  ];

  return (
    <div className="space-y-4">

      {/* ─── CTA 배너: 로그인 후 제공되는 기능 안내 ─── */}
      <div className="rounded-lg border border-accent/20 bg-accent/5 p-5 lg:p-6 text-center space-y-3">
        <h2 className="font-title text-lg lg:text-xl font-bold text-text">
          Google 계정으로 로그인하면 <br className="hidden sm:block" />
          블로그 데이터를 자동으로 분석해드립니다.
        </h2>
        <div className="flex flex-wrap justify-center gap-2">
          {features.map(f => (
            <span key={f} className="text-xs font-semibold px-3 py-1.5 rounded-full bg-surface border border-accent/20 text-accent">
              {f}
            </span>
          ))}
        </div>
        <div className="flex justify-center">
          <GoogleLoginButton redirectTo={loginRedirect} />
        </div>
      </div>

      {/* ─── 1. 프로필 헤더 (게스트) ─── */}
      <div className="bg-surface rounded-lg border border-border p-5 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
        <div className="flex flex-col sm:flex-row sm:items-center gap-4">
          <div className="flex items-center gap-4 min-w-0">
            <div className="w-16 h-16 rounded-full flex items-center justify-center bg-border/30 text-dim ring-2 ring-offset-2 ring-offset-surface ring-border/40 shrink-0">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>
            </div>
            <div className="flex-1 min-w-0">
              <h3 className="text-xl font-extrabold text-text">블로그를 연결하세요</h3>
              <p className="text-sm text-dim mt-1">Google 계정으로 로그인한 후 블로그를 연결하면 방문자, 순위, 발행 데이터 등을 자동으로 분석합니다.</p>
            </div>
          </div>
          <GoogleLoginButton redirectTo={loginRedirect} className="sm:ml-auto shrink-0" />
        </div>
      </div>

      {/* ─── 2. 대시보드 카드 (Empty State) ─── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {statCards.map((c, i) => (
          <AnimatedStatCard
            key={c.label}
            label={c.label}
            value={0}
            placeholder="-"
            icon={<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="9"/></svg>}
            color="dim"
            delay={i * 40}
            size={c.size}
            className={i === statCards.length - 1 ? 'lg:col-span-3' : undefined}
          />
        ))}
      </div>

      {/* ─── 3. 블로그 방문자수 그래프 (Empty State) ─── */}
      <GlassCard padding="sm">
        <div className="flex items-center gap-2 mb-3">
          <div className="w-7 h-7 rounded-lg bg-border/30 flex items-center justify-center text-dim">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
          </div>
          <h3 className="font-bold text-[15px]">블로그 방문자수</h3>
        </div>
        <div className="flex items-center justify-center py-9 text-center">
          <p className="text-sm text-dim">데이터가 없습니다. 로그인 후 자동으로 분석됩니다.</p>
        </div>
      </GlassCard>

      {/* ─── 4. 포스팅 목록 (Empty State) ─── */}
      <GlassCard padding="none">
        <div className="px-5 py-4 border-b border-border bg-bg/30">
          <h3 className="font-bold text-[15px]">내 블로그 포스팅</h3>
        </div>
        <div className="flex flex-col items-center justify-center py-14 gap-3">
          <p className="text-sm text-dim">연결된 블로그가 없습니다.</p>
          <GoogleLoginButton redirectTo={loginRedirect} />
        </div>
      </GlassCard>

    </div>
  );
}
