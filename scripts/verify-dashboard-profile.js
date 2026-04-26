const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

(async () => {
  // 옛날 select (이미 fix 됐지만 근본 원인 검증)
  const { data: oldSel, error: oldErr } = await sb
    .from('users')
    .select('id, name, naver_id, subscription_plan, subscription_expires_at')
    .eq('auth_id', '45d1a3e7-8ef9-4424-b017-adb5fdf926c5')
    .maybeSingle();
  console.log('OLD select (id, name, naver_id, ...):');
  console.log(' data:', JSON.stringify(oldSel));
  console.log(' error:', oldErr?.message);

  // 새 select (fix 적용)
  const { data: newSel, error: newErr } = await sb
    .from('users')
    .select('id, nickname, blog_id, linked_influencer_id, subscription_plan, subscription_expires_at')
    .eq('auth_id', '45d1a3e7-8ef9-4424-b017-adb5fdf926c5')
    .maybeSingle();
  console.log('\nNEW select (nickname, blog_id, linked_influencer_id, ...):');
  console.log(' data:', JSON.stringify(newSel));
  console.log(' error:', newErr?.message);

  // resolvePlan 시뮬레이션
  const plan = newSel?.subscription_plan;
  const expiresAt = newSel?.subscription_expires_at;
  let currentPlan = 'free';
  if (plan && expiresAt && new Date(expiresAt).getTime() > Date.now()) {
    if (plan === 'INFLUENCER') currentPlan = 'influencer';
    else if (plan === 'BLOGGER') currentPlan = 'blogger';
  }
  const ADMIN_IDS = (process.env.ADMIN_USER_IDS || '').split(',').map(s => s.trim());
  const isAdminUser = newSel?.id && ADMIN_IDS.includes(newSel.id);
  if (isAdminUser) currentPlan = 'influencer';

  const PLAN_RANK = { free: 0, blogger: 1, influencer: 2 };
  const lockedFeedback = PLAN_RANK[currentPlan] < PLAN_RANK['influencer'];

  console.log('\nResult: currentPlan =', currentPlan, '/ isAdminUser =', !!isAdminUser);
  console.log('AppCard locked for INFLUENCER card:', lockedFeedback ? 'YES (FAIL)' : 'NO (PASS)');
})();
