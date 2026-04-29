import { createClient } from '@supabase/supabase-js';
import { readFileSync, existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
const __dirname = dirname(fileURLToPath(import.meta.url));
const envPath = resolve(__dirname, '..', '.env.local');
if (existsSync(envPath)) {
  for (const line of readFileSync(envPath, 'utf-8').split('\n')) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const eq = t.indexOf('=');
    if (eq === -1) continue;
    const k = t.slice(0, eq).trim();
    const v = t.slice(eq + 1).trim().replace(/^["']|["']$/g, '');
    if (!process.env[k]) process.env[k] = v;
  }
}
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

// 매핑 있는 인플루언서 → 그 인플루언서의 매핑 키워드 모음 (DISTINCT 카운트만)
console.log('1) 활동 인플루언서 중 keyword_rankings 가 있는 인플루언서 수 측정...');

// 30일 이내 keyword_rankings 가 있는 inflexer count
const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
const { count: krCnt } = await sb
  .from('keyword_rankings')
  .select('*', { count: 'exact', head: true })
  .gte('snapshot_date', cutoff);
console.log(`  최근 30일 keyword_rankings 행: ${krCnt}건`);

// 전체 keyword_rankings 수
const { count: krAll } = await sb.from('keyword_rankings').select('*', { count: 'exact', head: true });
console.log(`  전체 keyword_rankings 행: ${krAll}건`);

// 매핑된 키워드 DISTINCT 수 (대략): 매핑 전체 수
const { count: ikAll } = await sb.from('influencer_keywords').select('*', { count: 'exact', head: true });
console.log(`  전체 influencer_keywords 매핑: ${ikAll}건`);

// keyword_challenges 활성 키워드 수
const { count: kwCnt } = await sb.from('keyword_challenges').select('*', { count: 'exact', head: true }).eq('is_active', true);
console.log(`  활성 키워드 수: ${kwCnt}개`);
