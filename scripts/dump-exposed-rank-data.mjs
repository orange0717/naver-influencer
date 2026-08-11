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

console.log('=== 노출로 잡힌 행 전부 ===\n');

// 세 탭 중 하나라도 노출(true)인 행을 모두 가져온다
const { data: rows, error } = await sb
  .from('keyword_rank_lookups')
  .select('user_id, blog_id, post_id, keyword, view_rank, view_exposed, blog_rank, blog_exposed, influencer_rank, influencer_exposed, search_volume, checked_at')
  .or('view_exposed.eq.true,blog_exposed.eq.true,influencer_exposed.eq.true')
  .order('checked_at', { ascending: false });

if (error) { console.error('조회 실패:', error.message); process.exit(1); }

for (const r of rows ?? []) {
  const t = r.checked_at ? new Date(r.checked_at).toLocaleString('ko-KR') : '';
  const parts = [];
  if (r.view_exposed === true) parts.push(`통합 ${r.view_rank}위`);
  if (r.blog_exposed === true) parts.push(`블로그 ${r.blog_rank}위`);
  if (r.influencer_exposed === true) parts.push(`인플 ${r.influencer_rank}위`);
  console.log(
    `[${r.blog_id}] "${r.keyword}"  →  ${parts.join(' / ')}\n` +
    `    postId=${r.post_id}  검색량=${r.search_volume ?? '-'}  ${t}  (uid ${mask(r.user_id)})`
  );
}
console.log(`\n총 ${rows?.length ?? 0}행`);
