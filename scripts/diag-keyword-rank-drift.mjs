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

async function col(table, columns) {
  const { error } = await sb.from(table).select(columns).limit(1);
  if (!error) return 'OK';
  return `${error.code || ''} ${error.message}`.trim();
}
async function rpc(name, args) {
  const { error } = await sb.rpc(name, args);
  if (!error) return 'OK';
  if (/does not exist|could not find/i.test(error.message)) return `MISSING: ${error.message}`;
  return `OK(호출성공/기타에러무시): ${error.code || ''}`;
}

const checks = [
  ['keyword_rank_lookups: view/blog (099)', () => col('keyword_rank_lookups', 'view_rank,blog_rank')],
  ['keyword_rank_lookups: influencer (123)', () => col('keyword_rank_lookups', 'influencer_rank,influencer_exposed')],
  ['keyword_rank_lookups: status/fail_count (142-예정)', () => col('keyword_rank_lookups', 'status,fail_count')],
  ['keyword_rank_history 테이블 (123)', () => col('keyword_rank_history', 'search_type,rank,checked_at')],
  ['get_keyword_rank_deltas RPC (123)', () => rpc('get_keyword_rank_deltas', { p_user_id: '00000000-0000-0000-0000-000000000000', p_blog_id: '__diag__' })],
  ['post_representative_keywords (130)', () => col('post_representative_keywords', 'representative_keyword,candidates,keyword_source')],
  ['post_missing_checks: view/blog/status (105)', () => col('post_missing_checks', 'view_exposed,blog_exposed,status,fail_count')],
  ['post_missing_checks: influencer (133)', () => col('post_missing_checks', 'influencer_exposed,influencer_rank')],
  ['post_missing_checks: search_candidates (135)', () => col('post_missing_checks', 'search_candidates')],
  ['ai_briefing_exposures: exposed (100)', () => col('ai_briefing_exposures', 'exposed')],
  ['ai_briefing_exposures: tab_exposed (101)', () => col('ai_briefing_exposures', 'tab_exposed,has_ai_tab')],
  ['ai_briefing_exposures: search meta (116)', () => col('ai_briefing_exposures', 'search_volume_monthly,competition')],
];

console.log('=== N인플 키워드순위 관련 DB 드리프트 진단 ===\n');
for (const [label, fn] of checks) {
  try { console.log(`${(await fn()) === 'OK' ? '✅' : '❌'}  ${label}  →  ${await fn()}`); }
  catch (e) { console.log(`⚠️   ${label}  →  예외 ${e.message}`); }
}
