/**
 * 심사위원 계정 발급 + 접근 점검 (로컬 실행용)
 *
 * 관리자 브라우저 세션 없이도 발급/점검을 끝내기 위한 스크립트.
 * /api/admin/judges 및 .../verify 와 동일한 절차를 service_role 로 수행한다.
 * 로그인 폼을 거치지 않고 Supabase Admin API 로 세션을 만들어 실제 화면을 요청한다.
 *
 * 사용법:
 *   node scripts/issue-judge-account.mjs \
 *     --email test@ninfle.kr --password test123 --name test \
 *     --blog orangelibrary_ --influencer orangelibrary --days 7
 */

import { readFileSync } from 'fs';
import { createClient } from '@supabase/supabase-js';
import { createServerClient } from '@supabase/ssr';

/* ── 인자 ─────────────────────────────────────────────── */
const args = {};
for (let i = 2; i < process.argv.length; i += 2) {
  args[process.argv[i].replace(/^--/, '')] = process.argv[i + 1];
}
const EMAIL = (args.email || 'test@ninfle.kr').toLowerCase();
const PASSWORD = args.password || 'test123';
const NAME = args.name || 'test';
const BLOG_ID = args.blog || '';
const INFLUENCER = args.influencer || '';
const DAYS = Number(args.days || 7);
const ORIGIN = args.origin || 'https://ninfle.kr';

/* ── env ──────────────────────────────────────────────── */
const env = {};
for (const line of readFileSync(new URL('../.env.local', import.meta.url), 'utf8').split('\n')) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '');
}
const URL_ = env.NEXT_PUBLIC_SUPABASE_URL;
const ANON = env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const SERVICE = env.SUPABASE_SERVICE_ROLE_KEY;

if (!SERVICE) {
  console.error('SUPABASE_SERVICE_ROLE_KEY 가 .env.local 에 비어 있습니다. 먼저 채워주세요.');
  process.exit(1);
}

const db = createClient(URL_, SERVICE, { auth: { persistSession: false } });

/* ── §2 점검 대상 25경로 ──────────────────────────────── */
const ROUTES = [
  ['대시보드', '/dashboard'], ['대시보드', '/my/missing-posts'],
  ['대시보드', '/my/keyword-ranking'], ['대시보드', '/my/naver-mate'],
  ['인플루언서', '/my'], ['인플루언서', '/topics'], ['인플루언서', '/my/fans'],
  ['포스팅', '/dashboard/writing/spellcheck'], ['포스팅', '/my/naver-mate/quality-evaluate'],
  ['네이버 데이터', '/naver-mate-ranking'], ['네이버 데이터', '/stats'],
  ['네이버 데이터', '/keywords'], ['네이버 데이터', '/keywords/recommend'],
  ['네이버 데이터', '/keywords/blogger'], ['네이버 데이터', '/keywords/bulk'],
  ['네이버 데이터', '/influencers/free-plan'], ['네이버 데이터', '/influencers'],
  ['콘텐츠 도구', '/dashboard/writing/content-angles'], ['콘텐츠 도구', '/dashboard/writing/titles'],
  ['콘텐츠 도구', '/dashboard/writing/color-palette'], ['콘텐츠 도구', '/image-editor'],
  ['콘텐츠 도구', '/dashboard/content/youtube'], ['콘텐츠 도구', '/dashboard/content/shortform'],
  ['콘텐츠 도구', '/dashboard/youtube-stt'], ['콘텐츠 도구', '/dashboard/google-indexing'],
];

function isGateRedirect(location) {
  if (!location) return false;
  try {
    const u = new URL(location, ORIGIN);
    if (u.pathname === '/') {
      return u.search.includes('authModal=login') || u.search.includes('memberOnly=1') || u.search === '';
    }
    return u.pathname === '/subscribe';
  } catch { return false; }
}

/* ── 1) 발급 ──────────────────────────────────────────── */
const expiresAt = new Date(Date.now() + DAYS * 864e5).toISOString();

let authId;
const { data: existingJudge } = await db.from('judge_accounts').select('id, auth_id, user_id').eq('email', EMAIL).maybeSingle();

if (existingJudge) {
  console.log(`이미 발급된 계정을 재사용합니다 (${EMAIL})`);
  authId = existingJudge.auth_id;
} else {
  const { data: created, error: cErr } = await db.auth.admin.createUser({
    email: EMAIL, password: PASSWORD, email_confirm: true,
  });
  if (cErr) { console.error('계정 생성 실패:', cErr.message); process.exit(1); }
  authId = created.user.id;

  const insert = {
    auth_id: authId, email: EMAIL, nickname: NAME,
    subscription_plan: 'INFLUENCER', subscription_expires_at: expiresAt,
  };
  if (BLOG_ID) insert.blog_id = BLOG_ID;

  const { data: userRow, error: uErr } = await db.from('users').insert(insert).select('id').single();
  if (uErr) {
    await db.auth.admin.deleteUser(authId);
    console.error('회원 생성 실패:', uErr.message); process.exit(1);
  }

  await db.from('judge_accounts').insert({
    user_id: userRow.id, auth_id: authId, display_name: NAME,
    email: EMAIL, expires_at: expiresAt,
  });

  if (INFLUENCER) {
    const { data: inf } = await db.from('influencers').select('id').eq('naver_id', INFLUENCER).maybeSingle();
    if (!inf) console.log(`인플루언서홈: '${INFLUENCER}' 를 찾지 못했습니다.`);
    else {
      const { error: lErr } = await db.from('users').update({ linked_influencer_id: inf.id }).eq('id', userRow.id);
      if (!lErr) console.log('인플루언서홈: 연결됨');
      else if (lErr.code === '23505') console.log('인플루언서홈: 이미 다른 계정에 연결돼 있어 연결하지 않았습니다(기존 연결 보존).');
      else console.log('인플루언서홈: 연결 실패 —', lErr.message);
    }
  }
  console.log(`발급 완료: ${EMAIL} / ${PASSWORD} (기한 ${expiresAt})`);
}

/* ── 2) 세션 생성 (로그인 폼 미경유) ──────────────────── */
const { data: link, error: lkErr } = await db.auth.admin.generateLink({ type: 'magiclink', email: EMAIL });
if (lkErr) { console.error('세션 토큰 발급 실패:', lkErr.message); process.exit(1); }

const anon = createClient(URL_, ANON, { auth: { persistSession: false, autoRefreshToken: false } });
const { data: verified, error: vErr } = await anon.auth.verifyOtp({
  type: 'magiclink', token_hash: link.properties.hashed_token,
});
if (vErr) { console.error('세션 생성 실패:', vErr.message); process.exit(1); }

const jar = [];
const ssr = createServerClient(URL_, ANON, {
  cookies: {
    getAll: () => jar.map(c => ({ name: c.name, value: c.value })),
    setAll: cs => { for (const c of cs) {
      const i = jar.findIndex(j => j.name === c.name);
      if (i >= 0) jar[i] = { name: c.name, value: c.value }; else jar.push({ name: c.name, value: c.value });
    } },
  },
});
await ssr.auth.setSession({
  access_token: verified.session.access_token,
  refresh_token: verified.session.refresh_token,
});
const cookie = jar.filter(c => c.value).map(c => `${c.name}=${encodeURIComponent(c.value)}`).join('; ');

/* ── 3) 25경로 점검 ───────────────────────────────────── */
console.log(`\n점검 대상 ${ROUTES.length}개 · ${ORIGIN}\n`);
const rows = [];
for (const [group, path] of ROUTES) {
  let status = null, result = 'error', to = null, note = '';
  try {
    const res = await fetch(`${ORIGIN}${path}`, {
      redirect: 'manual', cache: 'no-store',
      headers: { cookie, accept: 'text/html,application/xhtml+xml', 'user-agent': 'ninfle-judge-verify/1.0' },
      signal: AbortSignal.timeout(20000),
    });
    status = res.status;
    to = res.headers.get('location');
    if (status >= 300 && status < 400) {
      const gated = isGateRedirect(to);
      result = gated ? '접근 차단' : '접근 가능';
      if (!gated) note = `리다이렉트 → ${to}`;
      else note = `→ ${to}`;
    } else if (status >= 200 && status < 300) {
      result = '접근 가능';
    } else {
      result = '오류';
      if (status === 404) note = '경로 없음';
    }
  } catch (e) {
    note = e.name || '요청 실패';
  }
  rows.push({ group, path, status, result, note });
  console.log(`${String(status ?? '—').padEnd(4)} ${result.padEnd(6)} ${path.padEnd(42)} ${note}`);
}

const tally = rows.reduce((a, r) => { a[r.result] = (a[r.result] || 0) + 1; return a; }, {});
console.log(`\n집계: 접근 가능 ${tally['접근 가능'] || 0} · 접근 차단 ${tally['접근 차단'] || 0} · 오류 ${tally['오류'] || 0}`);
