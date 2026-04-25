#!/usr/bin/env node
/**
 * 플랜 일괄 부여 스크립트 (로컬 실행용)
 *
 * Usage:
 *   node scripts/bulk-grant-plan.mjs --dry-run
 *   node scripts/bulk-grant-plan.mjs --execute
 *
 * Options:
 *   --plan=INFLUENCER (default) | BLOGGER
 *   --days=7 (default)
 *   --scope=all (default) | inactive
 */

import { config } from 'dotenv';
import { createClient } from '@supabase/supabase-js';

// Next.js 관례: .env.local 우선
config({ path: '.env.local' });
config({ path: '.env' });

const args = process.argv.slice(2);
const argMap = Object.fromEntries(
  args.filter(a => a.startsWith('--')).map(a => {
    const [k, v = 'true'] = a.slice(2).split('=');
    return [k, v];
  })
);

const DRY_RUN = !argMap.execute;
const PLAN = (argMap.plan || 'INFLUENCER').toUpperCase();
const DAYS = parseInt(argMap.days || '7', 10);
const SCOPE = argMap.scope === 'inactive' ? 'inactive' : 'all';

if (PLAN !== 'INFLUENCER' && PLAN !== 'BLOGGER') {
  console.error('ERROR: --plan must be INFLUENCER or BLOGGER');
  process.exit(1);
}
if (!Number.isFinite(DAYS) || DAYS <= 0 || DAYS > 3650) {
  console.error('ERROR: --days must be 1~3650');
  process.exit(1);
}

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error('ERROR: NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY required');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

async function main() {
  const envEmails = (process.env.RESTRICTED_USER_EMAILS || '')
    .split(',')
    .map(s => s.trim().toLowerCase())
    .filter(Boolean);

  const { data: restrictedRows, error: rErr } = await supabase
    .from('restricted_users')
    .select('email');
  if (rErr) {
    console.error('ERROR restricted_users:', rErr.message);
    process.exit(1);
  }
  const dbEmails = (restrictedRows || [])
    .map(r => (r.email || '').toLowerCase())
    .filter(Boolean);

  const excludeSet = new Set([...envEmails, ...dbEmails]);
  console.log(`제외 대상: env ${envEmails.length}명 + DB ${dbEmails.length}명 = 총 ${excludeSet.size}명`);

  let query = supabase
    .from('users')
    .select('id, email, subscription_plan, subscription_expires_at');

  if (SCOPE === 'inactive') {
    const nowIso = new Date().toISOString();
    query = query.or(`subscription_plan.is.null,subscription_expires_at.lt.${nowIso}`);
  }

  const { data: users, error: sErr } = await query;
  if (sErr) {
    console.error('ERROR select users:', sErr.message);
    process.exit(1);
  }

  const targets = (users || []).filter(u => {
    const lower = (u.email || '').toLowerCase();
    return lower && !excludeSet.has(lower);
  });

  const expiresAt = new Date(Date.now() + DAYS * 24 * 60 * 60 * 1000).toISOString();

  console.log('\n=== 실행 설정 ===');
  console.log(`모드: ${DRY_RUN ? 'DRY RUN (실제 업데이트 없음)' : '실제 실행'}`);
  console.log(`플랜: ${PLAN}`);
  console.log(`기간: ${DAYS}일`);
  console.log(`범위: ${SCOPE}`);
  console.log(`만료일시: ${expiresAt}`);
  console.log(`\n대상 유저 수: ${targets.length}명`);
  console.log(`전체 유저: ${users.length}명 / 제외됨: ${users.length - targets.length}명`);

  // 현재 플랜 분포
  const planDist = {};
  for (const u of users || []) {
    const p = u.subscription_plan || 'NULL(무료)';
    planDist[p] = (planDist[p] || 0) + 1;
  }
  console.log('\n=== 현재 플랜 분포 (전체 유저) ===');
  for (const [p, c] of Object.entries(planDist)) {
    console.log(`  ${p}: ${c}명`);
  }

  if (DRY_RUN) {
    console.log('\n[DRY RUN] 실제 실행하려면 --execute 플래그 추가');
    return;
  }

  if (targets.length === 0) {
    console.log('\n업데이트할 대상이 없습니다.');
    return;
  }

  const CHUNK = 500;
  const targetIds = targets.map(u => u.id);
  let updatedTotal = 0;

  console.log(`\n업데이트 시작... (${CHUNK}개씩 청크)`);
  for (let i = 0; i < targetIds.length; i += CHUNK) {
    const chunk = targetIds.slice(i, i + CHUNK);
    const { error: updError, count } = await supabase
      .from('users')
      .update(
        {
          subscription_plan: PLAN,
          subscription_expires_at: expiresAt,
        },
        { count: 'exact' }
      )
      .in('id', chunk);

    if (updError) {
      console.error(`청크 ${i}~${i + chunk.length} 실패:`, updError.message);
      console.error(`현재까지 업데이트된 수: ${updatedTotal}`);
      process.exit(1);
    }
    updatedTotal += count || chunk.length;
    console.log(`  ${Math.min(i + CHUNK, targetIds.length)} / ${targetIds.length} 완료`);
  }

  console.log(`\n✓ 완료: ${updatedTotal}명 업데이트`);
}

main().catch(err => {
  console.error('FATAL:', err);
  process.exit(1);
});
