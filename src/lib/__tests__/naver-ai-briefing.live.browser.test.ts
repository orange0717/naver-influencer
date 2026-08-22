/**
 * AI 브리핑 · AI 탭 인용 판정 — **실 네이버** 라이브 검증 (기본 실행에서 건너뜀)
 * ──────────────────────────────────────────────────────────────────────────
 *   LIVE=1 npm run test:browser
 *
 * 실제 네이버 화면을 그대로 긁으므로 결과는 시점마다 달라진다(생성형 AI 특성).
 * 따라서 "인용됨/미인용" 자체를 단정 검증하지 않고, **시점과 무관하게 항상 참이어야 하는
 * 정직성 불변식**만 검증한다. 인용 여부의 정오 판단은 출력된 표를 실제 네이버 화면과
 * 눈으로 대조해서 한다(스펙 #18).
 *
 * 네이버 차단을 피하려 건 사이 BATCH_DELAY_MS 만큼 쉰다.
 */
import { describe, it, expect } from 'vitest';
import { writeFileSync } from 'fs';
import { checkAiBriefingExposure, isVerifiedStatus, type AiBriefingCheckResult } from '@/lib/naver-ai-briefing';
import { BATCH_DELAY_MS } from '@/lib/ai-citation-batch';

const REPORT_PATH = process.env.LIVE_REPORT_PATH || '/tmp/ninfle-ai-citation-live.json';

const LIVE = process.env.LIVE === '1';
const BLOG_ID = process.env.LIVE_BLOG_ID || 'orangelibrary_';

/** 대표키워드가 실제로 저장돼 있는 orangelibrary_ 포스팅 12건 (스펙 #18: 최소 10건) */
const TARGETS: { postId: string; keyword: string; title: string }[] = [
  { postId: '223920568644', keyword: '춘향전',                title: '춘향전 고전소설추천' },
  { postId: '224362420704', keyword: '카피라이팅',            title: '카피라이팅 짧고좋은글귀' },
  { postId: '224362070520', keyword: '말센스',                title: '말센스 짧고좋은글귀' },
  { postId: '224361005217', keyword: '쇼펜하우어',            title: '쇼펜하우어 아포리즘 독서교육명언' },
  { postId: '224372299411', keyword: '나미야 잡화점의 기적',  title: '나미야 잡화점의 기적' },
  { postId: '224369237616', keyword: '아비투스',              title: '아비투스 인문학책추천' },
  { postId: '224375531001', keyword: '좋은글귀',              title: '짧고 좋은글귀(니체의 초월자 中)' },
  { postId: '224374335975', keyword: '방구석미술관',          title: '방구석미술관 서양미술관련책추천' },
  { postId: '224360023585', keyword: '알랭 드 보통',          title: '알랭 드 보통 짧은명언' },
  { postId: '224371358296', keyword: '글쓰기전략',            title: '3개의 키워드 상위노출 1등하는 글쓰기전략' },
  { postId: '224370407819', keyword: '말의품격',              title: '말의품격 베스트셀러도서 자기계발책' },
  { postId: '224371554230', keyword: '부동산 투자 사업',      title: '운명을 바꾸는 부동산 투자 사업(기초편)' },
];

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));
const cell = (s: {
  status: string; errorCode: string | null; present: boolean | null;
  sourceIndex: number | null; sourceTotal: number | null;
}) => {
  if (!isVerifiedStatus(s.status as never)) return `${s.status}${s.errorCode ? `/${s.errorCode}` : ''}`;
  if (s.status === 'CITED') return `CITED(출처 ${s.sourceIndex}/${s.sourceTotal})`;
  // 출처를 읽고 없었던 것과, 영역 자체가 제공되지 않은 것은 전혀 다른 사실이다.
  return s.present === false ? 'NOT_CITED(영역 없음)' : `NOT_CITED(출처 ${s.sourceTotal}건 확인)`;
};

describe.skipIf(!LIVE)('실 네이버 라이브 검증 — 정직성 불변식', () => {
  it(`${BLOG_ID} 포스팅 ${TARGETS.length}건`, async () => {
    const rows: { t: (typeof TARGETS)[number]; r: AiBriefingCheckResult }[] = [];

    for (const [i, t] of TARGETS.entries()) {
      const r = await checkAiBriefingExposure(t.keyword, BLOG_ID, t.postId);
      rows.push({ t, r });
      if (i < TARGETS.length - 1) await sleep(BATCH_DELAY_MS);
    }

    // vitest 기본 리포터는 console 출력을 숨기므로 파일로도 남긴다.
    const table = [
      '| # | 키워드 | 포스팅 | AI 브리핑 | AI 탭 | 인용 URL |',
      '|---|--------|--------|-----------|-------|----------|',
      ...rows.map(({ t, r }, i) =>
        `| ${i + 1} | ${t.keyword} | ${t.title} | ${cell(r.briefing)} | ${cell(r.tab)} | ${r.briefing.matchedUrl || r.tab.matchedUrl || ''} |`),
    ].join('\n');
    console.log(`\n${table}`);
    writeFileSync(REPORT_PATH, JSON.stringify({
      blogId: BLOG_ID,
      checkedAt: new Date().toISOString(),
      table,
      rows: rows.map(({ t, r }) => ({ ...t, briefing: r.briefing, tab: r.tab, exposed: r.exposed, tabExposed: r.tabExposed })),
    }, null, 2));

    for (const { t, r } of rows) {
      const where = `${t.keyword}/${t.postId}`;

      // 1) 상태는 반드시 5개 중 하나 — boolean 으로 뭉개지지 않는다.
      expect(['CITED', 'NOT_CITED', 'UNVERIFIED', 'UNAVAILABLE', 'ERROR'], where).toContain(r.briefing.status);
      expect(['CITED', 'NOT_CITED', 'UNVERIFIED', 'UNAVAILABLE', 'ERROR'], where).toContain(r.tab.status);

      // 2) 확인에 실패한 표면은 절대 boolean(=미인용)으로 강등되지 않는다.
      if (!isVerifiedStatus(r.briefing.status)) expect(r.exposed, where).toBeNull();
      if (!isVerifiedStatus(r.tab.status)) expect(r.tabExposed, where).toBeNull();

      // 3) 판정 불가에는 사유가 반드시 남는다(사용자에게 원인을 설명할 수 있어야 한다).
      if (!isVerifiedStatus(r.briefing.status)) expect(r.briefing.errorCode, where).toBeTruthy();
      if (!isVerifiedStatus(r.tab.status)) expect(r.tab.errorCode, where).toBeTruthy();

      // 4) 인용 판정은 blogId+logNo 가 실제로 일치하는 URL 로만 나온다(제목 부분일치 금지).
      for (const s of [r.briefing, r.tab]) {
        if (s.status !== 'CITED') continue;
        expect(s.matchedUrl, where).toBeTruthy();
        expect(s.matchedUrl!.toLowerCase(), where).toContain(BLOG_ID.toLowerCase());
        expect(s.matchedUrl, where).toContain(t.postId);
        expect(s.sourceIndex, where).toBeGreaterThan(0);
      }

      // 5) 미인용은 "출처를 실제로 읽었을 때" 또는 "AI 영역 자체가 없을 때"만 나온다.
      for (const s of [r.briefing, r.tab]) {
        if (s.status !== 'NOT_CITED') continue;
        const readSources = (s.sourceTotal ?? 0) > 0;
        const areaAbsent = s.present === false;
        expect(readSources || areaAbsent, `${where} — 근거 없는 미인용`).toBe(true);
      }
    }
  }, 20 * 60 * 1000);
});
