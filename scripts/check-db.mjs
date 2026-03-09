import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';

const env = readFileSync('.env.local', 'utf8');
const url = env.match(/NEXT_PUBLIC_SUPABASE_URL=(.+)/)?.[1];
const key = env.match(/SUPABASE_SERVICE_ROLE_KEY=(.+)/)?.[1];
const s = createClient(url, key);

async function run() {
  const { count } = await s.from('influencers').select('id', { count: 'exact', head: true });
  console.log('전체 인플루언서:', count);

  let all = [];
  let from = 0;
  while (true) {
    const { data: batch } = await s.from('influencers').select('category').range(from, from + 999);
    if (batch === null || batch.length === 0) break;
    all = all.concat(batch);
    from += 1000;
  }
  const cats = {};
  all.forEach(i => {
    const c = i.category || '(없음)';
    cats[c] = (cats[c] || 0) + 1;
  });
  console.log('\n카테고리별 분포:');
  Object.entries(cats).sort((a, b) => b[1] - a[1]).forEach(([c, n]) => console.log(`  ${c}: ${n}`));
  console.log('\npagination 합계:', all.length);
}
run();
