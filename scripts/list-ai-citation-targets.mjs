/**
 * AI 인용 실검증용 대상 뽑기 — 대표키워드가 있는 (블로그, 포스팅) 조합을 보여준다.
 *   node scripts/list-ai-citation-targets.mjs [blogId]
 */
import { requireSupabaseClient } from './_supabase-env.mjs';

const supabase = requireSupabaseClient();
const blogId = process.argv[2];

if (!blogId) {
  const { data, error } = await supabase
    .from('post_representative_keywords')
    .select('blog_id')
    .not('representative_keyword', 'is', null)
    .limit(5000);
  if (error) { console.error(error); process.exit(1); }
  const counts = {};
  for (const r of data) counts[r.blog_id] = (counts[r.blog_id] || 0) + 1;
  console.log('대표키워드 보유 블로그 상위:');
  for (const [id, n] of Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 15)) {
    console.log(`  ${id}\t${n}건`);
  }
  process.exit(0);
}

const { data, error } = await supabase
  .from('post_representative_keywords')
  .select('post_id, post_title, representative_keyword')
  .eq('blog_id', blogId)
  .not('representative_keyword', 'is', null)
  .limit(60);
if (error) { console.error(error); process.exit(1); }

console.log(JSON.stringify(data, null, 1));
