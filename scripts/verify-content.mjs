import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';
config({ path: '/Users/orange/개발/naver-influencer/.env.local' });
const s = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const { data: inf } = await s.from('influencers').select('id').eq('display_name', '오렌지도서관').single();

const { count: total } = await s.from('keyword_rankings').select('id', { count: 'exact', head: true }).eq('influencer_id', inf.id);
const { count: nonzero } = await s.from('keyword_rankings').select('id', { count: 'exact', head: true }).eq('influencer_id', inf.id).gt('content_count', 0);
console.log('전체 ranking:', total, '/ content_count > 0:', nonzero);

// 샘플
const { data: samples } = await s
  .from('keyword_rankings')
  .select('content_count, rank_position, keyword_challenges(keyword)')
  .eq('influencer_id', inf.id)
  .gt('content_count', 0)
  .order('content_count', { ascending: false })
  .limit(10);
console.log('\nTop content_count:');
samples?.forEach(r => console.log(`  ${r.keyword_challenges?.keyword.padEnd(20)} 글 ${r.content_count} / 순위 ${r.rank_position}`));
