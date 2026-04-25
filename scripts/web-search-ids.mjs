import { readFileSync } from 'fs';
import { resolve } from 'path';

const envContent = readFileSync(resolve(import.meta.dirname, '../.env.local'), 'utf-8');
const env = {};
for (const line of envContent.split('\n')) {
  const match = line.match(/^([^#=]+)="?([^"]*)"?$/);
  if (match) env[match[1].trim()] = match[2].trim();
}

const targets = [
  '개비단대리님 인플루언서',
  '시그널 텍스투박스 인플루언서',
  '빵야누나 인플루언서 동물',
  '읏디 고양이 인플루언서',
  '조덕호아카이브 영화 인플루언서',
];

for (const q of targets) {
  const url = `https://openapi.naver.com/v1/search/webkr.json?query=${encodeURIComponent(q)}&display=10`;
  const res = await fetch(url, {
    headers: {
      'X-Naver-Client-Id': env.NAVER_SEARCH_CLIENT_ID,
      'X-Naver-Client-Secret': env.NAVER_SEARCH_CLIENT_SECRET,
    }
  });
  const data = await res.json();
  console.log(`\n[${q}]`);
  for (const item of (data.items || [])) {
    const link = item.link || '';
    const title = (item.title || '').replace(/<[^>]+>/g, '');
    if (link.includes('in.naver.com')) {
      const naverId = link.replace(/.*in\.naver\.com\//, '').replace(/[\/?].*/, '');
      console.log(`  ${title} -> in.naver.com/${naverId}`);
    }
  }
  await new Promise(r => setTimeout(r, 300));
}
