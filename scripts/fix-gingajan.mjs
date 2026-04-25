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

// 긴가쟌 검색
const { data } = await supabase
  .from('influencers')
  .select('id, naver_id, display_name, last_crawled_at')
  .or('display_name.ilike.%긴가쟌%,naver_id.ilike.%긴가쟌%');

if (!data || data.length === 0) {
  console.log('긴가쟌을 찾을 수 없습니다');
  process.exit(1);
}

for (const inf of data) {
  console.log(`발견: ${inf.display_name} (@${inf.naver_id}), 현재 last_crawled_at: ${inf.last_crawled_at}`);
  const { error } = await supabase
    .from('influencers')
    .update({ last_crawled_at: '2023-11-24T00:00:00+09:00' })
    .eq('id', inf.id);
  if (error) console.log('실패:', error.message);
  else console.log('-> 2023-11-24로 수정 완료');
}
