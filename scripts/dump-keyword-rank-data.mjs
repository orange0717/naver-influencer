import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';

// .env.local 파싱 (키 값은 출력하지 않음)
const env = {};
for (const line of readFileSync(new URL('../.env.local', import.meta.url), 'utf8').split('\n')) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '');
}
const url = env.NEXT_PUBLIC_SUPABASE_URL;
const key = env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) { console.error('환경변수 누락'); process.exit(1); }
const sb = createClient(url, key, { auth: { persistSession: false } });

const mask = (s) => (s ? String(s).slice(0, 8) + '…' : '(null)');
const yn = (v) => (v === true ? '노출' : v === false ? '미노출' : '미확인');

console.log('=== keyword_rank_lookups 실데이터 ===\n');

// 1) 총 행 수 + checked_at 유무
const { count: total } = await sb.from('keyword_rank_lookups').select('*', { count: 'exact', head: true });
const { count: checked } = await sb.from('keyword_rank_lookups').select('*', { count: 'exact', head: true }).not('checked_at', 'is', null);
const { count: pending } = await sb.from('keyword_rank_lookups').select('*', { count: 'exact', head: true }).is('checked_at', null);
console.log(`총 행: ${total ?? '?'}  |  조회완료(checked_at≠null): ${checked ?? '?'}  |  미조회(null): ${pending ?? '?'}\n`);

// 2) 노출 분포 (view/blog/influencer)
for (const [label, col] of [['통합검색', 'view_exposed'], ['블로그탭', 'blog_exposed'], ['인플루언서', 'influencer_exposed']]) {
  const t = (await sb.from('keyword_rank_lookups').select('*', { count: 'exact', head: true }).eq(col, true)).count ?? 0;
  const f = (await sb.from('keyword_rank_lookups').select('*', { count: 'exact', head: true }).eq(col, false)).count ?? 0;
  const n = (await sb.from('keyword_rank_lookups').select('*', { count: 'exact', head: true }).is(col, null)).count ?? 0;
  console.log(`${label.padEnd(6)}  노출 ${t}  /  미노출 ${f}  /  미확인(null) ${n}`);
}

// 3) 블로그별 행 수 TOP
const { data: allRows } = await sb.from('keyword_rank_lookups').select('blog_id');
const byBlog = {};
for (const r of allRows ?? []) byBlog[r.blog_id] = (byBlog[r.blog_id] || 0) + 1;
const topBlogs = Object.entries(byBlog).sort((a, b) => b[1] - a[1]).slice(0, 10);
console.log('\n--- 블로그별 등록 키워드 수 (상위 10) ---');
for (const [bid, c] of topBlogs) console.log(`  ${bid.padEnd(24)}  ${c}건`);

// 4) 최근 조회 샘플 20건
const { data: sample } = await sb
  .from('keyword_rank_lookups')
  .select('user_id, blog_id, keyword, view_rank, view_exposed, blog_rank, blog_exposed, influencer_rank, influencer_exposed, search_volume, checked_at')
  .not('checked_at', 'is', null)
  .order('checked_at', { ascending: false })
  .limit(20);
console.log('\n--- 최근 조회된 순위 샘플 20건 ---');
for (const r of sample ?? []) {
  const t = r.checked_at ? new Date(r.checked_at).toLocaleString('ko-KR') : '';
  console.log(
    `[${r.blog_id}] "${r.keyword}"  통합:${yn(r.view_exposed)}${r.view_rank != null ? `(${r.view_rank}위)` : ''}` +
    `  블로그:${yn(r.blog_exposed)}${r.blog_rank != null ? `(${r.blog_rank}위)` : ''}` +
    `  인플:${yn(r.influencer_exposed)}${r.influencer_rank != null ? `(${r.influencer_rank}위)` : ''}` +
    `  검색량:${r.search_volume ?? '-'}  · ${t}  (uid ${mask(r.user_id)})`
  );
}
