const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
(async () => {
  const { data: authList } = await sb.auth.admin.listUsers({ perPage: 200 });
  const authMap = new Map(authList.users.map(u => [u.id, (u.email || '').toLowerCase()]));
  const { data: users } = await sb.from('users').select('id, auth_id, email');
  const mismatches = users.filter(
    u => u.auth_id && authMap.has(u.auth_id) && (u.email || '').toLowerCase() !== authMap.get(u.auth_id)
  );
  console.log('email mismatches remaining:', mismatches.length);
  mismatches.forEach(u => console.log(' -', u.id, ':', u.email, '!=', authMap.get(u.auth_id)));
})();
