// 인플루언서 탭 순위 부풀림 버그로 잘못 저장된 influencer_rank를, 수정된 로직(1페이지·오프셋 제거)으로
// 재조회해 교정한다. 대상: influencer_exposed=true 행 전부.
import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
import * as cheerio from 'cheerio';

const env = {};
for (const line of readFileSync(new URL('../.env.local', import.meta.url), 'utf8').split('\n')) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '');
}
const url = env.NEXT_PUBLIC_SUPABASE_URL;
const key = env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) { console.error('환경변수 누락'); process.exit(1); }
const sb = createClient(url, key, { auth: { persistSession: false } });

const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'ko-KR,ko;q=0.9',
  'Accept-Encoding': 'gzip, deflate',
  'Referer': 'https://search.naver.com/',
};
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

// 수정된 checkInfluencerTab과 동일: 1페이지, in.naver handle(0 base) → blog data-cr-on(r 그대로) → href 카운트(0 base)
async function checkInfluencerFixed(query, blogId, postId) {
  const blogIdLower = blogId.toLowerCase();
  const postIdStr = String(postId || '');
  const base = `https://search.naver.com/search.naver?ssc=tab.influencer.all&sm=tab_jum&query=${encodeURIComponent(query)}`;
  try {
    const res = await fetch(base, { headers: HEADERS });
    if (!res.ok) return { exposed: false, rank: null, error: true };
    const html = await res.text();

    // in.naver handle 매칭
    const inRegex = /in\.naver\.com\/([a-zA-Z0-9_-]+)\/contents\/internal\/(\d+)/g;
    const seenIn = new Set();
    let rank = 0, mm, via = null;
    while ((mm = inRegex.exec(html)) !== null) {
      const k = `${mm[1]}/${mm[2]}`;
      if (seenIn.has(k)) continue;
      seenIn.add(k);
      rank++;
      if (mm[1].toLowerCase() === blogIdLower) return { exposed: true, rank, via: 'in.naver handle' };
    }

    if (postIdStr) {
      // data-cr-on 정밀
      const rankRegex = /data-url="https?:\/\/blog\.naver\.com\/([a-zA-Z0-9_-]+)\/(\d+)"[^>]*?data-cr-on="r=(\d+)/g;
      const seen = new Set();
      let mt;
      while ((mt = rankRegex.exec(html)) !== null) {
        const [, lb, lp, rs] = mt;
        const k = `${lb}/${lp}`;
        if (seen.has(k)) continue;
        seen.add(k);
        if (lb.toLowerCase() === blogIdLower && lp === postIdStr) return { exposed: true, rank: parseInt(rs), via: 'blog data-cr-on' };
      }
      // href 카운트
      const $ = cheerio.load(html);
      const seenFb = new Set();
      let g = 0, found = null;
      $('a').each((_, el) => {
        if (found !== null) return;
        const href = $(el).attr('href') || '';
        const m2 = href.match(/blog\.naver\.com\/([a-zA-Z0-9_-]+)\/(\d+)/);
        if (!m2) return;
        const k = `${m2[1]}/${m2[2]}`;
        if (seenFb.has(k)) return;
        seenFb.add(k);
        g++;
        if (m2[1].toLowerCase() === blogIdLower && m2[2] === postIdStr) found = g;
      });
      if (found !== null) return { exposed: true, rank: found, via: 'blog href카운트' };
    }
    return { exposed: false, rank: null };
  } catch {
    return { exposed: false, rank: null, error: true };
  }
}

const { data: rows, error } = await sb
  .from('keyword_rank_lookups')
  .select('user_id, blog_id, post_id, keyword, influencer_rank')
  .eq('influencer_exposed', true);

if (error) { console.error('조회 실패:', error.message); process.exit(1); }

const upd = (r, fields) => sb
  .from('keyword_rank_lookups')
  .update(fields)
  .eq('user_id', r.user_id).eq('post_id', r.post_id).eq('keyword', r.keyword);

console.log(`=== 인플루언서 노출 ${rows.length}건 재조회·교정 ===\n`);
for (const r of rows) {
  const live = await checkInfluencerFixed(r.keyword, r.blog_id, r.post_id);
  const nowIso = new Date().toISOString();
  if (live.error) {
    console.log(`[${r.blog_id}] "${r.keyword}"  재조회 실패(일시오류) → 건너뜀 (기존 ${r.influencer_rank}위 유지)`);
  } else if (live.exposed && live.rank !== r.influencer_rank) {
    const { error: e } = await upd(r, { influencer_rank: live.rank, influencer_exposed: true, checked_at: nowIso, updated_at: nowIso });
    console.log(`[${r.blog_id}] "${r.keyword}"  ${r.influencer_rank}위 → ${live.rank}위 (${live.via})  ${e ? '❌ ' + e.message : '✅ 교정'}`);
  } else if (live.exposed) {
    console.log(`[${r.blog_id}] "${r.keyword}"  ${r.influencer_rank}위 (변동 없음, ${live.via})`);
  } else {
    const { error: e } = await upd(r, { influencer_rank: null, influencer_exposed: false, checked_at: nowIso, updated_at: nowIso });
    console.log(`[${r.blog_id}] "${r.keyword}"  ${r.influencer_rank}위 → 미노출  ${e ? '❌ ' + e.message : '✅ 교정(미노출)'}`);
  }
  await sleep(800);
}
console.log('\n교정 완료');
