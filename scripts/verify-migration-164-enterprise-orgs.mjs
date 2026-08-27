/**
 * migration-164 적용 확인(읽기 전용).
 *
 * 마이그레이션 파일만 커밋되고 DB에는 안 올라간 채 방치되는 사고가 반복돼,
 * "SQL Editor에서 성공했다"는 구두 확인 대신 실제 조회로 확인한다.
 * SQL Editor는 파일 전체를 한 트랜잭션으로 돌리므로 중간에 하나만 실패해도 전부 롤백된다
 * — 즉 아래 4개 테이블은 전부 있거나 전부 없거나 둘 중 하나여야 정상이다.
 *
 *   node scripts/verify-migration-164-enterprise-orgs.mjs
 */
import { requireSupabaseClient } from './_supabase-env.mjs';

const supabase = requireSupabaseClient();

const TABLES = [
  'enterprise_orgs',
  'enterprise_org_members',
  'enterprise_org_invites',
  'enterprise_orders',
];

// 선행 조건: migration-164 는 update_updated_at() 트리거 함수를 쓰는데, 그 정의는
// 이 저장소 어디에도 없다(라이브 DB에만 존재). 없으면 트랜잭션이 통째로 롤백되므로
// 같은 함수를 쓰는 migration-160 의 산물이 살아있는지로 존재 여부를 대신 확인한다.
const { error: preError } = await supabase.from('enterprise_inquiries').select('id').limit(1);
if (preError) {
  console.log(`  ⚠️  선행 확인 실패 — enterprise_inquiries 없음 (${preError.message})`);
  console.log('     update_updated_at() 도 없을 가능성이 높다. 있는지 먼저 확인하고 실행할 것.');
} else {
  console.log('  ✅ 선행 조건            update_updated_at() 사용 마이그레이션(160) 적용됨');
}

const missing = [];

for (const name of TABLES) {
  const { error } = await supabase.from(name).select('id').limit(1);
  if (error) {
    missing.push(name);
    console.log(`  ❌ ${name.padEnd(24)} ${error.message}`);
  } else {
    console.log(`  ✅ ${name.padEnd(24)} 조회 가능`);
  }
}

// 헬퍼 함수까지 올라갔는지 확인. 이게 없으면 RLS 정책이 통째로 안 만들어진 것이다.
const { error: fnError } = await supabase.rpc('current_user_org_id');
const fnOk = !fnError || !/could not find|does not exist/i.test(fnError.message);
console.log(`  ${fnOk ? '✅' : '❌'} current_user_org_id()    ${fnOk ? '존재' : fnError.message}`);

if (missing.length === 0 && fnOk) {
  console.log('\n결과: migration-164 적용 확인됨');
  process.exit(0);
}

console.log(`\n결과: ❌ 미적용 — Supabase SQL Editor에서 supabase/migration-164-enterprise-orgs.sql 전체를 실행할 것`);
if (missing.length > 0 && missing.length < TABLES.length) {
  console.log('   일부만 존재한다 = 이전 실행이 중간에 깨졌다는 뜻. 남은 객체를 정리하고 다시 실행할 것.');
}
process.exit(1);
