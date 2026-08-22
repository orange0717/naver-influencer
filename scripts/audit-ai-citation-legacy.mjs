/**
 * 기존 ai_briefing_exposures 데이터가 "확인 실패"를 미인용으로 굳혀놨는지 감사(읽기 전용, 스펙 #16).
 *   node scripts/audit-ai-citation-legacy.mjs
 */
import { requireSupabaseClient } from './_supabase-env.mjs';

const supabase = requireSupabaseClient();
const { data, error } = await supabase
  .from('ai_briefing_exposures')
  .select('post_id, keyword, exposed, tab_exposed, check_status, checked_at, source_total, tab_source_total');
if (error) { console.error(error); process.exit(1); }

const bucket = {};
const add = k => { bucket[k] = (bucket[k] || 0) + 1; };

for (const r of data) {
  add(`check_status=${r.check_status ?? 'NULL'}`);
}

console.log(`총 ${data.length}행`);
console.log('\n[check_status 분포]');
for (const [k, v] of Object.entries(bucket).sort((a, b) => b[1] - a[1])) console.log(`  ${k}\t${v}`);

// 화면에서 "미인용"으로 보이고 있었지만 근거(출처 목록)가 없는 행
const groundless = data.filter(r =>
  (r.exposed === false && !(r.source_total > 0)) || (r.tab_exposed === false && !(r.tab_source_total > 0)));
const failedButFalse = data.filter(r =>
  r.check_status !== 'ok' && (r.exposed === false || r.tab_exposed === false));

console.log(`\n[정직성 감사]`);
console.log(`  exposed/tab_exposed=false 인데 출처를 하나도 못 읽은 행: ${groundless.length}`);
console.log(`  확인 실패(check_status≠ok)인데 false 로 저장된 행:      ${failedButFalse.length}`);
console.log(`  → 이 행들은 migration-159 백필에서 NOT_CITED 가 아니라 UNVERIFIED 로 재분류된다.`);

console.log('\n[샘플 5건]');
for (const r of groundless.slice(0, 5)) {
  console.log(`  ${r.post_id} "${r.keyword}" exposed=${r.exposed}(src=${r.source_total}) tab=${r.tab_exposed}(src=${r.tab_source_total}) status=${r.check_status}`);
}
