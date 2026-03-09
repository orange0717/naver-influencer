import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  'https://gppfpmuadpnxmeefomwz.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdwcGZwbXVhZHBueG1lZWZvbXd6Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3Mjk3OTY1MiwiZXhwIjoyMDg4NTU1NjUyfQ.-DcOEoFdTSp20XbViMPIHyOleDgYg8h5tvmcUGFBUzk'
);

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
      console.error(`  FAIL: ${user.email} - ${error.message}`);
    } else {
      console.log(`  OK: ${user.email} 인증 완료`);
    }
  }

  console.log('\n완료!');
}

confirmAll();
