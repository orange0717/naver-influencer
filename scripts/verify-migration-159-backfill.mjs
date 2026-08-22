/**
 * migration-159 백필 정직성 검증(읽기 전용).
 *
 * 핵심 질문: 구 엔진이 "확인 실패"를 "미인용"으로 세탁해 저장한 행들이,
 * 백필에서 NOT_CITED 로 굳지 않고 UNVERIFIED(재확인 대상)로 갔는가?
 *
 *   node scripts/verify-migration-159-backfill.mjs
 */
import { requireSupabaseClient } from './_supabase-env.mjs';

const supabase = requireSupabaseClient();

const { data: rows, error } = await supabase
  .from('ai_briefing_exposures')
  .select('check_status, exposed, tab_exposed, source_total, briefing_status, tab_status, briefing_error, tab_error');

if (error) {
  console.error('조회 실패:', error.message);
  process.exit(1);
}

const tally = (key) => rows.reduce((m, r) => {
  const k = r[key] ?? 'NULL';
  m[k] = (m[k] || 0) + 1;
  return m;
}, {});

const show = (label, t) => {
  console.log(`\n[${label}]`);
  for (const [k, v] of Object.entries(t).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${String(k).padEnd(14)} ${String(v).padStart(4)}건`);
  }
};

console.log(`총 ${rows.length}행`);
show('구 check_status', tally('check_status'));
show('신 briefing_status', tally('briefing_status'));
show('신 tab_status', tally('tab_status'));

// ── 불변식 검증 ───────────────────────────────────────────────
const fail = [];
const pass = [];
const check = (name, bad) => (bad.length === 0 ? pass : fail).push(`${name} — 위반 ${bad.length}건`);

// 1) 가장 중요: 출처 목록을 읽은 적도 없는 행이 NOT_CITED 로 굳으면 안 된다.
check('출처 미확보(source_total NULL) 행이 NOT_CITED 로 확정되지 않음',
  rows.filter(r => (r.source_total ?? null) === null
    && (r.briefing_status === 'NOT_CITED' || r.tab_status === 'NOT_CITED')));

// 2) 구 엔진의 exposed=false 는 전부 UNVERIFIED 로 유예됐어야 한다.
check('구 exposed=false 가 NOT_CITED 로 확정되지 않음',
  rows.filter(r => r.check_status === 'ok' && r.exposed !== true && r.briefing_status === 'NOT_CITED'));
check('구 tab_exposed=false 가 NOT_CITED 로 확정되지 않음',
  rows.filter(r => r.check_status === 'ok' && r.tab_exposed !== true && r.tab_status === 'NOT_CITED'));

// 3) 인용 확인된 과거 데이터는 보존됐어야 한다(정보 손실 금지).
check('구 exposed=true → briefing_status=CITED 보존',
  rows.filter(r => r.check_status === 'ok' && r.exposed === true && r.briefing_status !== 'CITED'));
check('구 tab_exposed=true → tab_status=CITED 보존',
  rows.filter(r => r.check_status === 'ok' && r.tab_exposed === true && r.tab_status !== 'CITED'));

// 4) 미확정 상태에는 재확인 사유가 남아야 한다.
check('UNVERIFIED/UNAVAILABLE 에 briefing_error 존재',
  rows.filter(r => ['UNVERIFIED', 'UNAVAILABLE'].includes(r.briefing_status) && !r.briefing_error));

// 5) 상태 값은 허용된 5개 + NULL 뿐이어야 한다.
const ALLOWED = ['CITED', 'NOT_CITED', 'UNVERIFIED', 'UNAVAILABLE', 'ERROR', null];
check('상태 값이 허용 집합 안에 있음',
  rows.filter(r => !ALLOWED.includes(r.briefing_status) || !ALLOWED.includes(r.tab_status)));

console.log('\n[불변식 검증]');
pass.forEach(m => console.log(`  ✅ ${m}`));
fail.forEach(m => console.log(`  ❌ ${m}`));

const unsettled = rows.filter(r =>
  ['UNVERIFIED', 'UNAVAILABLE', 'ERROR'].includes(r.briefing_status) ||
  ['UNVERIFIED', 'UNAVAILABLE', 'ERROR'].includes(r.tab_status)).length;
console.log(`\n재확인 대상(미확정) ${unsettled}건 / 총 ${rows.length}건`);
console.log(fail.length === 0 ? '\n결과: 백필 정직성 통과' : `\n결과: ❌ ${fail.length}개 불변식 위반`);
process.exit(fail.length === 0 ? 0 : 1);
