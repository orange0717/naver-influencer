import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const envContent = readFileSync(resolve(import.meta.dirname, '../.env.local'), 'utf-8');
const env = {};
for (const line of envContent.split('\n')) {
  const match = line.match(/^([^#=]+)="?([^"]*)"?$/);
  if (match) env[match[1].trim()] = match[2].trim();
}
const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

const PARTICIPATED_API = 'https://gw.in.naver.com/keyword-challenge/api/v2/participated-keywords';

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function fetchAllKeywords(ownerId) {
  const results = [];
  let cursor = '';
  while (true) {
    const url = `${PARTICIPATED_API}?ownerId=${ownerId}&limit=50${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`;
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(15000) });
      if (!res.ok) break;
      const json = await res.json();
      const items = json?.data || [];
      results.push(...items);
      if (results.length >= 2000) break;
      cursor = json?.paging?.nextCursor;
      if (!cursor || items.length < 50) break;
      await sleep(300);
    } catch { break; }
  }
  return results;
}

const TARGET = 'happyday4918';
const { data: inf } = await supabase
  .from('influencers')
  .select('id, naver_id, naver_owner_id')
  .eq('naver_id', TARGET)
  .single();

if (!inf) { console.log('not found'); process.exit(1); }
console.log('target:', inf);

const ownerId = inf.naver_owner_id;
if (!ownerId) { console.log('no ownerId'); process.exit(1); }

const keywords = await fetchAllKeywords(ownerId);
console.log(`fetched ${keywords.length} keywords`);

const updateData = {};
if (keywords.length > 0) {
  const dates = keywords.map(k => k.lastChallengedAt).filter(Boolean)
    .map(d => new Date(d + '+09:00').getTime()).filter(t => !isNaN(t));
  if (dates.length > 0) {
    const lastChallengedAt = new Date(Math.max(...dates)).toISOString();
    updateData.last_challenged_at = lastChallengedAt;
    updateData.last_crawled_at = lastChallengedAt;
  }
  const ranked = keywords.filter(k => k.rank != null && k.rank > 0);
  const t1 = ranked.filter(k => k.rank === 1).length;
  const t2 = ranked.filter(k => k.rank === 2).length;
  const t3 = ranked.filter(k => k.rank === 3).length;
  updateData.total_keywords = keywords.length;
  updateData.integrated_top3_count = t1 + t2 + t3;
  updateData.top1_count = t1;
  updateData.top2_count = t2;
  updateData.top3_count = t3;
  updateData.top3_ratio = keywords.length > 0 ? +((t1+t2+t3)/keywords.length).toFixed(4) : 0;
  updateData.best_rank = ranked.length > 0 ? Math.min(...ranked.map(k => k.rank)) : null;
  updateData.avg_rank = ranked.length > 0 ? +(ranked.reduce((s,k)=>s+k.rank,0)/ranked.length).toFixed(2) : null;
}

console.log('update:', updateData);
const { error } = await supabase.from('influencers').update(updateData).eq('id', inf.id);
if (error) console.log('err:', error); else console.log('done');
