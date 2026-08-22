/**
 * migration-159 적용 여부 + 마이그레이션이 참조하는 기존 컬럼 존재 확인(읽기 전용).
 *   node scripts/check-ai-citation-columns.mjs
 */
import { requireSupabaseClient } from './_supabase-env.mjs';

const supabase = requireSupabaseClient();

const NEW_COLUMNS = [
  'briefing_status', 'briefing_error_code', 'briefing_error',
  'tab_status', 'tab_error_code', 'tab_error', 'checking_started_at',
];
// 백필 UPDATE 문이 읽는 기존 컬럼들 — 하나라도 없으면 마이그레이션이 실패한다.
const REQUIRED_EXISTING = ['check_status', 'exposed', 'tab_exposed', 'last_error', 'user_id', 'checked_at'];

const probe = async (table, col) => {
  const { error } = await supabase.from(table).select(col).limit(1);
  return !error;
};

console.log('[migration-159 이 추가할 컬럼]');
for (const col of NEW_COLUMNS) {
  console.log(`  ai_briefing_exposures.${col.padEnd(20)} ${await probe('ai_briefing_exposures', col) ? '있음(적용됨)' : '없음(미적용)'}`);
}
for (const col of ['briefing_status', 'tab_status']) {
  console.log(`  ai_briefing_exposure_history.${col.padEnd(15)} ${await probe('ai_briefing_exposure_history', col) ? '있음(적용됨)' : '없음(미적용)'}`);
}

console.log('\n[백필이 참조하는 기존 컬럼 — 없으면 마이그레이션 실패]');
for (const col of REQUIRED_EXISTING) {
  const ok = await probe('ai_briefing_exposures', col);
  console.log(`  ai_briefing_exposures.${col.padEnd(20)} ${ok ? '있음' : '❌ 없음'}`);
}

const { count } = await supabase
  .from('ai_briefing_exposures')
  .select('*', { count: 'exact', head: true });
console.log(`\nai_briefing_exposures 총 행수: ${count}`);
