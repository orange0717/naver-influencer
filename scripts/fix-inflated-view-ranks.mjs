// 통합검색 순위 부풀림 버그로 잘못 저장된 view_rank를, 수정된 로직(1페이지·r= 그대로)으로
// 재조회해 교정한다. 대상: 통합검색 노출(view_exposed=true) 행 전부.
import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';

const env = {};
for (const line of readFileSync(new URL('../.env.local', import.meta.url), 'utf8').split('\n')) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '');
}
const url = env.NEXT_PUBLIC_SUPABASE_URL;
const key = env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) { console.error('환경변수 누락'); process.exit(1); }
const sb = createClient(url, key, { auth: { persistSession: false } });

const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
const HEADERS = {
  'User-Agent': USER_AGENT,
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'ko-KR,ko;q=0.9',
  'Accept-Encoding': 'gzip, deflate',
  'Referer': 'https://search.naver.com/',
};
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

// 수정된 checkViewTab과 동일: 1페이지만, r= 그대로. (in.naver handle 근사매칭 포함)
async function checkViewFixed(query, blogId, postId) {
  const blogIdLower = blogId.toLowerCase();
  const postIdStr = String(postId || '');
  const base = `https://search.naver.com/search.naver?where=webkr&sm=tab_jum&query=${encodeURIComponent(query)}`;
  try {
    const res = await fetch(base, { headers: HEADERS });
    if (!res.ok) return { exposed: false, rank: null, error: true };
    const html = await res.text();
    if (postIdStr) {
      const rankRegex = /data-url="https?:\/\/blog\.naver\.com\/([a-zA-Z0-9_-]+)\/(\d+)"[^>]*?data-cr-on="r=(\d+)/g;
      const seen = new Set();
      let mt;
      while ((mt = rankRegex.exec(html)) !== null) {
        const [, lb, lp, rs] = mt;
        const k = `${lb}/${lp}`;
        if (seen.has(k)) continue;
        seen.add(k);
        if (lb.toLowerCase() === blogIdLower && lp === postIdStr) return { exposed: true, rank: parseInt(rs) };
      }
    }
    const inRegex = /in\.naver\.com\/([a-zA-Z0-9_-]+)\/contents\/internal\/(\d+)/g;
    const seenIn = new Set();
    let rank = 0, m;
    while ((m = inRegex.exec(html)) !== null) {
      const k = `${m[1]}/${m[2]}`;
      if (seenIn.has(k)) continue;
      seenIn.add(k);
      rank++;
      if (m[1].toLowerCase() === blogIdLower) return { exposed: true, rank };
    }
    return { exposed: false, rank: null };
  } catch (err) {
    return { exposed: false, rank: null, error: true };
  }
}

const { data: rows, error } = await sb
  .from('keyword_rank_lookups')
  .select('user_id, blog_id, post_id, keyword, view_rank')
  .eq('view_exposed', true);

const upd = (r, fields) => sb
  .from('keyword_rank_lookups')
  .update(fields)
  .eq('user_id', r.user_id)
  .eq('post_id', r.post_id)
  .eq('keyword', r.keyword);

if (error) { console.error('조회 실패:', error.message); process.exit(1); }

console.log(`=== 통합검색 노출 ${rows.length}건 재조회·교정 ===\n`);
for (const r of rows) {
  const live = await checkViewFixed(r.keyword, r.blog_id, r.post_id);
  if (live.error) {
    console.log(`[${r.blog_id}] "${r.keyword}"  재조회 실패(일시오류) → 건너뜀 (기존 ${r.view_rank}위 유지)`);
    await sleep(800);
    continue;
  }
  if (live.exposed && live.rank !== r.view_rank) {
    const nowIso = new Date().toISOString();
    const { error: upErr } = await upd(r, { view_rank: live.rank, view_exposed: true, checked_at: nowIso, updated_at: nowIso });
    console.log(`[${r.blog_id}] "${r.keyword}"  ${r.view_rank}위 → ${live.rank}위  ${upErr ? '❌ ' + upErr.message : '✅ 교정'}`);
  } else if (live.exposed) {
    console.log(`[${r.blog_id}] "${r.keyword}"  ${r.view_rank}위 (변동 없음)`);
  } else {
    const nowIso = new Date().toISOString();
    const { error: upErr } = await upd(r, { view_rank: null, view_exposed: false, checked_at: nowIso, updated_at: nowIso });
    console.log(`[${r.blog_id}] "${r.keyword}"  ${r.view_rank}위 → 미노출  ${upErr ? '❌ ' + upErr.message : '✅ 교정(미노출)'}`);
  }
  await sleep(800);
}
console.log('\n교정 완료');
