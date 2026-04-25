import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';
config({ path: '/Users/orange/개발/naver-influencer/.env.local' });
const s = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const { data: inf } = await s.from('influencers').select('id, category, my_keyword_category').eq('display_name', '오렌지도서관').single();

// TOP3 + content > 0 + 본인 카테고리 조회
const cat = inf.my_keyword_category || inf.category;
const { data } = await s
  .from('keyword_rankings')
  .select('rank_position, content_count, keyword_challenges!inner(keyword, participant_count, category)')
  .eq('influencer_id', inf.id)
  .lte('rank_position', 3)
  .gt('content_count', 0)
  .eq('keyword_challenges.category', cat);

let total = 0;
const rows = (data || []).map(r => {
  const kc = r.keyword_challenges;
  const eligible = kc.participant_count > r.rank_position;
  const score = eligible ? (kc.participant_count - r.rank_position) * r.content_count : 0;
  total += score;
  return { keyword: kc.keyword, rank: r.rank_position, pc: kc.participant_count, cc: r.content_count, score };
}).sort((a, b) => b.score - a.score);

console.log(`카테고리: ${cat}`);
console.log(`TOP3 + content>0 키워드: ${rows.length}개`);
console.log(`v3 예상 점수 합계: ${total.toLocaleString()}`);

console.log('\nTop 10 기여 키워드:');
rows.slice(0, 10).forEach(r => console.log(`  ${r.keyword.padEnd(20)} 순위${r.rank} / 참여${String(r.pc).padStart(4)} / 글${String(r.cc).padStart(3)} → ${r.score.toLocaleString()}`));

console.log('\nBottom 5 (점수>0):');
rows.filter(r => r.score > 0).slice(-5).forEach(r => console.log(`  ${r.keyword.padEnd(20)} 순위${r.rank} / 참여${String(r.pc).padStart(4)} / 글${String(r.cc).padStart(3)} → ${r.score.toLocaleString()}`));

const zero = rows.filter(r => r.score === 0).length;
console.log(`\n참여=순위로 0점된 TOP3: ${zero}개`);
