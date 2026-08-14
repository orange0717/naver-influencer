import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';
import { writeFileSync } from 'fs';
config({ path: '/Users/orange/개발/ninfle/.env.local' });
const s = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const A = '35dce6b4-1d1f-4183-8f5a-ae7b9d160791'; // orangelibrary  (valid handle, NOT linked) -> to delete
const B = '35d7c734-10da-45d5-aad4-1549e85a504f'; // orangelibrary_ (404 handle, linked)      -> to keep, rename

// full row backup
const { data: rowA } = await s.from('influencers').select('*').eq('id', A).single();
const { data: rowB } = await s.from('influencers').select('*').eq('id', B).single();

// candidate tables that may carry influencer_id
const tables = ['keyword_rankings','influencer_keywords','naver_influencer_topics','naver_influencer_topic_posts','rank_alerts','recommendations','daily_recommendations','influencer_daily_stats','naver_mates','competitor_watches','saved_keywords','post_missing_checks','ai_briefing_exposures'];
const refCounts = {};
for (const t of tables) {
  try {
    const { count: ca, error: ea } = await s.from(t).select('*', { count:'exact', head:true }).eq('influencer_id', A);
    if (ea) { refCounts[t] = `no influencer_id col? (${ea.code})`; continue; }
    const { count: cb } = await s.from(t).select('*', { count:'exact', head:true }).eq('influencer_id', B);
    refCounts[t] = { A: ca, B: cb };
  } catch (e) { refCounts[t] = 'err:'+e.message; }
}
const stamp = new Date().toISOString().replace(/[:.]/g,'-');
const backup = { stamp, A: rowA, B: rowB, refCounts };
const path = `/Users/orange/개발/ninfle/scripts/merge-backup-${stamp}.json`;
writeFileSync(path, JSON.stringify(backup, null, 2));
console.log('backup written:', path);
console.log('\n=== influencer_id reference counts (A=orangelibrary to delete, B=orangelibrary_ to keep) ===');
for (const [t,v] of Object.entries(refCounts)) console.log(t.padEnd(28), JSON.stringify(v));
console.log('\nrowA fan/sub/tot:', rowA.fan_count, rowA.subscriber_count, rowA.total_follower_count, '| naver_id:', rowA.naver_id);
console.log('rowB fan/sub/tot:', rowB.fan_count, rowB.subscriber_count, rowB.total_follower_count, '| naver_id:', rowB.naver_id);
process.exit(0);
