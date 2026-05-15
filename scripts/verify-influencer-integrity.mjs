/**
 * 인플루언서 DB 정합성 요약 (로컬 확인용)
 *
 * 사용: 프로젝트 루트에 .env.local (NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
 *   node scripts/verify-influencer-integrity.mjs
 *
 * Supabase에 migration-097-influencer-data-integrity-summary.sql 이 적용되어 있어야
 * influencer_data_integrity_summary RPC 가 동작합니다.
 */
import { createClient } from '@supabase/supabase-js';
import { readFileSync, existsSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
for (const name of ['.env.local', '.env']) {
  const envPath = join(root, name);
  if (!existsSync(envPath)) continue;
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

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error('NEXT_PUBLIC_SUPABASE_URL 및 SUPABASE_SERVICE_ROLE_KEY 가 필요합니다.');
  process.exit(1);
}

const sb = createClient(url, key);
const { data, error } = await sb.rpc('influencer_data_integrity_summary');

if (error) {
  console.error('RPC 오류:', error.message);
  console.error('→ supabase/migrations/migration-097-influencer-data-integrity-summary.sql 을 Supabase에 적용했는지 확인하세요.');
  process.exit(2);
}

console.log(JSON.stringify(data, null, 2));
