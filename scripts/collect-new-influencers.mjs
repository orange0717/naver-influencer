// collect-new-influencers.mjs
// 실행: node scripts/collect-new-influencers.mjs
// env: SUPABASE_URL, SUPABASE_SERVICE_KEY, NAVER_NEW_URL (신규 인플루언서 탭 URL), TARGET_CATEGORY(선택, 기본 '도서')

import { chromium } from 'playwright';
import { createClient } from '@supabase/supabase-js';

const TARGET_URL = process.env.NAVER_NEW_URL ?? 'https://in.naver.com/';
const TARGET_CATEGORY = process.env.TARGET_CATEGORY ?? '도서';

function fmtNow() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

// 가이드라인 2: 응답 스키마가 바뀌어도 살아남도록 키를 동적으로 탐색
function extractFromApiJson(json) {
  const arrKeys = ['list', 'items', 'influencers', 'contents', 'data', 'result', 'channels'];
  let arr = null;
  (function walk(o) {
    if (!o || typeof o !== 'object' || arr) return;
    for (const k of arrKeys) {
      if (Array.isArray(o[k]) && o[k][0] && typeof o[k][0] === 'object') {
        arr = o[k];
        return;
      }
    }
    for (const v of Object.values(o)) walk(v);
  })(json);
  if (!arr) return [];

  return arr
    .map((it) => ({
      user_id: it.influencerId ?? it.userId ?? it.id ?? it.profileId ?? it.channelId ?? null,
      nickname: it.nickname ?? it.name ?? it.displayName ?? it.title ?? null,
      category: it.category ?? it.categoryName ?? it.field ?? it.topic ?? it.interest ?? null,
      fan_count: it.fanCount ?? it.fans ?? it.followerCount ?? null,
      blog_neighbor_count: it.buddyCount ?? it.neighborCount ?? null,
    }))
    .filter((r) => r.user_id);
}

async function collect() {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ userAgent: 'Mozilla/5.0' });
  const page = await ctx.newPage();

  // 가이드라인 2-①: in.naver.com/api/* JSON 응답을 1순위로 캡처
  const captured = [];
  page.on('response', async (res) => {
    const url = res.url();
    if (!/in\.naver\.com\/.*api/i.test(url)) return;
    if (!(res.headers()['content-type'] ?? '').includes('json')) return;
    try {
      captured.push(...extractFromApiJson(await res.json()));
    } catch {}
  });

  await page.goto(TARGET_URL, { waitUntil: 'networkidle' });

  // 가이드라인 2-①: infinite scroll — 신규 응답이 멈출 때까지 반복
  let prev = -1;
  for (let i = 0; i < 40 && captured.length !== prev; i++) {
    prev = captured.length;
    await page.evaluate(() => window.scrollBy(0, window.innerHeight * 2));
    await page.waitForTimeout(1200);
  }

  // 가이드라인 2-②: 클래스명 의존 X — "팬하기"/"인플루언서 홈" 앵커 + @ID 패턴 + data-* 컨테이너
  let domItems = [];
  if (!captured.length) {
    domItems = await page.evaluate(() => {
      const ANCHORS = ['팬하기', '인플루언서 홈'];
      const anchors = [...document.querySelectorAll('a,button,span,div')].filter((el) =>
        ANCHORS.some((k) => el.textContent.includes(k)),
      );
      const seen = new Set();
      const out = [];
      for (const a of anchors) {
        const card = a.closest('[data-shadow],[data-area-code],[data-clk],li,article,section');
        if (!card || seen.has(card)) continue;
        seen.add(card);
        const handle = [...card.querySelectorAll('*')]
          .map((el) => el.textContent.trim())
          .find((t) => /^@[A-Za-z0-9_.\-]+$/.test(t));
        if (!handle) continue;
        const nick = [...card.querySelectorAll('strong,h2,h3,[class*="name"],[class*="title"]')].find(
          (el) => el.textContent.trim() && !el.textContent.startsWith('@'),
        );
        const cat = [...card.querySelectorAll('[class*="category"],[class*="field"],[class*="topic"]')][0];
        out.push({
          user_id: handle.slice(1),
          nickname: nick?.textContent.trim() ?? null,
          category: cat?.textContent.trim() ?? null,
          fan_count: null,
          blog_neighbor_count: null,
        });
      }
      return out;
    });
  }

  await browser.close();

  // 페이지 내 중복 머지
  const merged = new Map();
  for (const it of [...captured, ...domItems]) {
    if (it.user_id && !merged.has(it.user_id)) merged.set(it.user_id, it);
  }
  const fetched = [...merged.values()];

  // 가이드라인 2-③: Supabase 기존 데이터와 diff → 오늘 처음 발견된 것만 push
  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY, {
    auth: { persistSession: false },
  });
  const ids = fetched.map((x) => x.user_id);
  const { data: existing } = await supabase
    .from('naver_influencers')
    .select('user_id')
    .in('user_id', ids);
  const known = new Set((existing ?? []).map((r) => r.user_id));

  const now = fmtNow();
  const newOnes = fetched
    .filter((x) => !known.has(x.user_id))
    .filter((x) => !TARGET_CATEGORY || (x.category ?? '').includes(TARGET_CATEGORY))
    .map((x) => ({
      user_id: x.user_id,
      nickname: x.nickname,
      category: x.category,
      discovered_at: now,
    }));

  // 가이드라인 3: 표준 JSON 배열 출력
  process.stdout.write(JSON.stringify(newOnes, null, 2));
  return newOnes;
}

collect().catch((e) => {
  console.error(e);
  process.exit(1);
});
