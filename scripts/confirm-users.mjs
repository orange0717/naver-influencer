import { requireSupabaseClient } from './_supabase-env.mjs';

const supabase = requireSupabaseClient();

async function confirmAll() {
  const { data: { users }, error: listErr } = await supabase.auth.admin.listUsers();
  if (listErr) {
    console.error('List error:', listErr);
    return;
  }

  console.log('등록된 사용자:');
  for (const u of users) {
    const confirmed = u.email_confirmed_at ? 'YES' : 'NO';
    console.log(`  ${u.email} | confirmed: ${confirmed} | id: ${u.id}`);
  }

  const unconfirmed = users.filter(u => !u.email_confirmed_at);
  if (unconfirmed.length === 0) {
    console.log('\n모든 사용자가 이미 인증되어 있습니다.');
    return;
  }

  console.log(`\n미인증 사용자 ${unconfirmed.length}명 인증 처리 중...`);
  for (const user of unconfirmed) {
    const { error } = await supabase.auth.admin.updateUserById(user.id, {
      email_confirm: true,
    });
    if (error) {
      console.error(`  FAIL ${user.email}:`, error.message);
    } else {
      console.log(`  OK ${user.email}`);
    }
  }
}

confirmAll();
