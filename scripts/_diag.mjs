import { createClient } from '@supabase/supabase-js';
import { readFileSync, existsSync } from 'fs';
const envPath = '/Users/orange/개발/naver-influencer/.env.local';
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

const naverIds = ['heyllaattee','cookcookoven','eksqlsj','daynbi','kimsua226','victoryjeju','dinnernin','btac228kc','9reeyoun','kim10n12','louie','happyday4918','jini79','kingrandy'];

for (const nid of naverIds) {
  const { data: inf } = await sb.from('influencers').select('id, display_name, total_keywords, top1_count, top2_count, top3_count, integrated_top3_count').eq('naver_id', nid).maybeSingle();
  if (!inf) { console.log(`${nid}: NOT FOUND`); continue; }
  const { count: mapCnt } = await sb.from('influencer_keywords').select('*', { count: 'exact', head: true }).eq('influencer_id', inf.id);
  const { count: rkAll } = await sb.from('keyword_rankings').select('*', { count: 'exact', head: true }).eq('influencer_id', inf.id);
  const cutoff = new Date(Date.now() - 30*24*60*60*1000).toISOString().slice(0,10);
  const { count: rk30 } = await sb.from('keyword_rankings').select('*', { count: 'exact', head: true }).eq('influencer_id', inf.id).gte('snapshot_date', cutoff);
  const { count: rkTop3 } = await sb.from('keyword_rankings').select('*', { count: 'exact', head: true }).eq('influencer_id', inf.id).lte('rank_position', 3).gte('snapshot_date', cutoff);
  console.log(`${nid.padEnd(20)} ${(inf.display_name||'').padEnd(15)} chal=${String(inf.total_keywords||0).padStart(4)} map=${String(mapCnt||0).padStart(5)} rkAll=${String(rkAll||0).padStart(4)} rk30=${String(rk30||0).padStart(4)} top3_30d=${String(rkTop3||0).padStart(3)} dbTop3=${inf.integrated_top3_count||0}`);
}
