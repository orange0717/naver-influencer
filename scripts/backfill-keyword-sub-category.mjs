/**
 * keyword_challenges.sub_category 백필.
 *
 * 세부분류 판정의 정본은 src/data/subcategory-map.ts 다. 이 스크립트는 그 규칙을 그대로 돌려
 * 결과를 컬럼에 적는다(migration-206 적용 뒤 1회, 규칙을 고친 뒤에는 --all 로 다시).
 *
 *   node scripts/backfill-keyword-sub-category.mjs            # sub_category 가 비어 있는 행만
 *   node scripts/backfill-keyword-sub-category.mjs --all      # 전 행 재계산
 *   node scripts/backfill-keyword-sub-category.mjs --dry-run  # 쓰지 않고 분포만 출력
 *
 * .ts 를 직접 import 하므로 Node 22.18+ 가 필요하다.
 */
import { requireSupabaseClient } from './_supabase-env.mjs';
import { getSubcategory } from '../src/data/subcategory-map.ts';

const ALL = process.argv.includes('--all');
const DRY = process.argv.includes('--dry-run');
const READ_PAGE = 1000;
const WRITE_BATCH = 200;

const sb = requireSupabaseClient();

// 1) 대상 행 읽기 — id 순으로 끊어 읽어야 도중에 값이 바뀌어도 건너뛰지 않는다.
const rows = [];
let lastId = null;
for (;;) {
  let q = sb
    .from('keyword_challenges')
    .select('id, keyword, category, sub_category')
    .order('id', { ascending: true })
    .limit(READ_PAGE);
  if (lastId) q = q.gt('id', lastId);
  if (!ALL) q = q.is('sub_category', null);
  const { data, error } = await q;
  if (error) {
    console.error('읽기 실패:', error.message);
    process.exit(1);
  }
  if (!data || data.length === 0) break;
  rows.push(...data);
  lastId = data[data.length - 1].id;
  if (data.length < READ_PAGE) break;
}
console.log(`대상 ${rows.length.toLocaleString()}행 (${ALL ? '전 행' : '빈 행만'})`);

// 2) 규칙 적용 — 값이 달라지는 행만 (카테고리, 세부분류)별로 묶는다.
//    규칙이 없는 카테고리는 '' 가 나온다. NULL 로 두면 다음 실행 때 또 대상이 되므로 '' 그대로 적는다.
const groups = new Map();
const dist = new Map();
for (const r of rows) {
  const sub = getSubcategory(r.category, r.keyword);
  dist.set(`${r.category} / ${sub || '(규칙 없음)'}`, (dist.get(`${r.category} / ${sub || '(규칙 없음)'}`) || 0) + 1);
  if (r.sub_category === sub) continue;
  if (!groups.has(sub)) groups.set(sub, []);
  groups.get(sub).push(r.id);
}
const changed = [...groups.values()].reduce((n, ids) => n + ids.length, 0);
console.log(`바뀌는 행 ${changed.toLocaleString()}개`);

if (DRY) {
  for (const [k, n] of [...dist.entries()].sort((a, b) => b[1] - a[1]).slice(0, 60)) {
    console.log(`  ${k}: ${n.toLocaleString()}`);
  }
  console.log('--dry-run: 쓰지 않았다.');
  process.exit(0);
}

// 3) 쓰기
let done = 0;
let failed = 0;
for (const [sub, ids] of groups) {
  for (let i = 0; i < ids.length; i += WRITE_BATCH) {
    const batch = ids.slice(i, i + WRITE_BATCH);
    const { error } = await sb.from('keyword_challenges').update({ sub_category: sub }).in('id', batch);
    if (error) {
      failed += batch.length;
      console.error(`쓰기 실패(${sub || '규칙 없음'}, ${batch.length}행):`, error.message);
    } else {
      done += batch.length;
    }
    if ((done + failed) % 5000 < WRITE_BATCH) console.log(`  ${(done + failed).toLocaleString()} / ${changed.toLocaleString()}`);
  }
}
console.log(`완료: ${done.toLocaleString()}행 갱신, ${failed.toLocaleString()}행 실패`);
if (failed > 0) process.exit(1);
