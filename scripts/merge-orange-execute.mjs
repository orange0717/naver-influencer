import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';
config({ path: '/Users/orange/개발/ninfle/.env.local' });
const s = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

const A = '35dce6b4-1d1f-4183-8f5a-ae7b9d160791'; // orangelibrary  (valid handle, NOT linked) -> DELETE
const B = '35d7c734-10da-45d5-aad4-1549e85a504f'; // orangelibrary_ (404 handle, linked)      -> KEEP + rename
const B_USER = '7529a7a5-7a4f-4af8-90c8-2e2327de9ab2';
const CANON = 'orangelibrary';

function die(msg, err) { console.error('✗', msg, err || ''); process.exit(1); }

// ── 0. 안전 재확인: 정식 핸들 200, 밑줄 핸들 404 ──
const okRes = await fetch(`https://in.naver.com/${CANON}`, { headers: { 'User-Agent': UA, 'Accept-Language': 'ko-KR' } });
const badRes = await fetch(`https://in.naver.com/${CANON}_`, { headers: { 'User-Agent': UA, 'Accept-Language': 'ko-KR' } });
console.log(`preflight: /${CANON}=${okRes.status}  /${CANON}_=${badRes.status}`);
if (okRes.status !== 200) die('정식 핸들이 200이 아님 — 중단');
if (badRes.status !== 404) console.warn('⚠ 밑줄 핸들이 404가 아님 — 그래도 진행(연결행 B는 id로 특정)');

// ── 1. A 자식행 삭제 (keyword data는 B의 부분집합, 검증 완료) ──
{
  const { error, count } = await s.from('influencer_keywords').delete({ count: 'exact' }).eq('influencer_id', A);
  if (error) die('influencer_keywords(A) 삭제 실패', error);
  console.log('deleted influencer_keywords(A):', count);
}
{
  const { error, count } = await s.from('keyword_rankings').delete({ count: 'exact' }).eq('influencer_id', A);
  if (error) die('keyword_rankings(A) 삭제 실패', error);
  console.log('deleted keyword_rankings(A):', count);
}

// ── 2. A 행 삭제 ──
{
  const { error } = await s.from('influencers').delete().eq('id', A);
  if (error) die('influencers(A) 삭제 실패 — 다른 FK가 A를 참조 중일 수 있음', error);
  console.log('deleted influencer row A (orangelibrary duplicate)');
}

// ── 3. 라이브 네이버 홈에서 팬수/팔로워 실측 ──
let subscriberCount = null, totalFollowerCount = null, ownerId = null;
{
  const html = await okRes.text();
  const idx = html.indexOf('__PRELOADED_STATE__');
  if (idx !== -1) {
    const js = html.indexOf('{', idx);
    let depth = 0, end = -1;
    for (let i = js; i < html.length; i++) { if (html[i]==='{')depth++; if(html[i]==='}'){depth--; if(depth===0){end=i+1;break;}} }
    const state = JSON.parse(html.substring(js, end));
    const d = state?.space?.data || {};
    subscriberCount = d?.stats?.subscriberCount ?? d?.subscriberCount ?? null;
    totalFollowerCount = d?.totalFollowerCount ?? null;
    ownerId = d?.ownerId != null ? String(d.ownerId) : null;
  }
}
console.log('live fans:', { subscriberCount, totalFollowerCount, ownerId });

// ── 4. B 교정: naver_id + 팬수(SoT=subscriber) 실데이터 반영 ──
{
  const upd = { naver_id: CANON, updated_at: new Date().toISOString() };
  if (subscriberCount && subscriberCount > 0) { upd.subscriber_count = subscriberCount; upd.fan_count = subscriberCount; }
  if (totalFollowerCount && totalFollowerCount > 0) upd.total_follower_count = totalFollowerCount;
  if (ownerId) upd.naver_owner_id = ownerId;
  const { error } = await s.from('influencers').update(upd).eq('id', B);
  if (error) die('influencers(B) 교정 실패', error);
  console.log('updated B →', upd);
}

// ── 5. users.blog_id 정합 ──
{
  const { error } = await s.from('users').update({ blog_id: CANON }).eq('id', B_USER);
  if (error) console.warn('⚠ users.blog_id 갱신 실패(치명 아님):', error.message);
  else console.log('updated users.blog_id →', CANON);
}

// ── 6. 토픽 재수집: in.naver.com/{CANON}/topic Apollo 파싱 후 upsert ──
function extractApolloState(html) {
  const marker = 'window.__APOLLO_STATE__ = ';
  const start = html.indexOf(marker);
  if (start === -1) return null;
  const jsonStart = start + marker.length;
  let depth = 0, inStr = false, esc = false, end = -1;
  for (let i = jsonStart; i < html.length; i++) {
    const ch = html[i];
    if (inStr) { if (esc) esc = false; else if (ch === '\\') esc = true; else if (ch === '"') inStr = false; continue; }
    if (ch === '"') { inStr = true; continue; }
    if (ch === '{') depth++;
    else if (ch === '}') { depth--; if (depth === 0) { end = i + 1; break; } }
  }
  if (end === -1) return null;
  try { return JSON.parse(html.slice(jsonStart, end)); } catch { return null; }
}
const resolveRef = (state, v) => (v && typeof v === 'object' && '__ref' in v) ? state[v.__ref] : v;
{
  const tRes = await fetch(`https://in.naver.com/${encodeURIComponent(CANON)}/topic`, { headers: { 'User-Agent': UA, 'Accept-Language': 'ko-KR,ko;q=0.9', Referer: `https://in.naver.com/${CANON}` } });
  if (!tRes.ok) { console.warn('⚠ 토픽 페이지', tRes.status, '— 토픽 재수집 스킵'); }
  else {
    const html = await tRes.text();
    const state = extractApolloState(html);
    const root = state?.ROOT_QUERY;
    const key = root ? Object.keys(root).find(k => k.startsWith('topicCards:')) : null;
    const topicCards = key ? root[key] : null;
    const items = (topicCards?.items || []).map(r => resolveRef(state, r)).filter(v => v && typeof v === 'object');
    const now = new Date().toISOString();
    const rows = items.map(raw => ({
      user_id: B_USER,
      blog_id: CANON,
      topic_id: String(raw.id ?? ''),
      is_own_blog: true,
      title: raw.title || '',
      thumbnail_url: raw.thumbnailUrl || null,
      content_count: Number(raw.contentCount ?? 0),
      introduction: raw.introduction || null,
      topic_subject: raw.topicSubject || null,
      topic_subject_category: raw.topicSubjectCategory || null,
      topic_subject_category_id: raw.topicSubjectCategoryId != null ? String(raw.topicSubjectCategoryId) : null,
      naver_created_at: raw.createdAt || null,
      naver_modified_at: raw.modifiedAt || null,
      scraped_at: now,
    }));
    console.log('topic cards parsed:', rows.length, '| reported topicCount:', topicCards?.topicCount);
    if (rows.length > 0) {
      const { error } = await s.from('naver_influencer_topics').upsert(rows, { onConflict: 'user_id,blog_id,topic_id' });
      if (error) die('naver_influencer_topics upsert 실패', error);
      console.log('upserted topics:', rows.length);
    }
  }
}

console.log('\n✅ 병합 완료');
process.exit(0);
