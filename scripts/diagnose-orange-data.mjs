import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';
config({ path: '/Users/orange/개발/ninfle/.env.local' });

const s = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

function log(...a) { console.log(...a); }

// 1) influencer row
const { data: infList, error: infErr } = await s
  .from('influencers')
  .select('*')
  .eq('display_name', '오렌지도서관');
if (infErr) { console.error('influencer lookup error', infErr); process.exit(1); }
log('오렌지도서관 매칭 인플루언서 수:', infList.length);
infList.forEach((r, i) => log(`  [${i}] id=${r.id} naver_id=${r.naver_id} sub=${r.subscriber_count} tot=${r.total_follower_count} fan=${r.fan_count} kw=${r.total_keywords} updated=${r.updated_at}`));
// pick the one linked to a user, else the most-updated
const { data: linkRows } = await s.from('users').select('linked_influencer_id').not('linked_influencer_id', 'is', null);
const linkedIds = new Set((linkRows || []).map(r => r.linked_influencer_id));
const inf = infList.find(r => linkedIds.has(r.id)) || infList.slice().sort((a,b)=> (b.updated_at||'').localeCompare(a.updated_at||''))[0];
log('→ 선택된 인플루언서 id:', inf.id, '(linked=' + linkedIds.has(inf.id) + ')');

log('==== DB: influencers ====');
log('id                :', inf.id);
log('naver_id          :', inf.naver_id);
log('naver_owner_id    :', inf.naver_owner_id);
log('display_name      :', inf.display_name);
log('subscriber_count  :', inf.subscriber_count);
log('total_follower_cnt:', inf.total_follower_count);
log('fan_count         :', inf.fan_count);
log('total_keywords    :', inf.total_keywords);
log('category          :', inf.category, '| my_keyword_category:', inf.my_keyword_category);
log('updated_at        :', inf.updated_at);

// find internal user linked to this influencer
const { data: userRow } = await s
  .from('users')
  .select('id, blog_id, linked_influencer_id')
  .eq('linked_influencer_id', inf.id)
  .maybeSingle();
log('\n==== DB: linked user ====');
log('internal user_id  :', userRow?.id);
log('blog_id           :', userRow?.blog_id);

const naverId = inf.naver_id;
const internalUserId = userRow?.id;

// 2) topics in naver_influencer_topics
if (internalUserId) {
  const { count: topicCount } = await s
    .from('naver_influencer_topics')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', internalUserId)
    .eq('blog_id', naverId)
    .eq('is_own_blog', true);
  log('\n==== DB: naver_influencer_topics (own) ====');
  log('topic rows        :', topicCount);
  const { data: sampleTopics } = await s
    .from('naver_influencer_topics')
    .select('title, content_count, scraped_at')
    .eq('user_id', internalUserId)
    .eq('blog_id', naverId)
    .eq('is_own_blog', true)
    .order('content_count', { ascending: false })
    .limit(5);
  (sampleTopics || []).forEach(t => log('  -', t.title, '| posts:', t.content_count, '| scraped:', t.scraped_at));
} else {
  log('\n[warn] no internal user linked → topic/AI queries skipped');
}

// 3) participated keywords (influencer_keywords)
const { count: ikCount } = await s
  .from('influencer_keywords')
  .select('keyword_id', { count: 'exact', head: true })
  .eq('influencer_id', inf.id);
log('\n==== DB: influencer_keywords (참여 SoT) ====');
log('participated rows :', ikCount);

// 4) keyword_rankings — latest rank per keyword_id, distribution
//    paginate to pull all recent rows
async function pullRankings(sinceDays) {
  const since = new Date(Date.now() - sinceDays * 864e5).toISOString().slice(0, 10);
  const rows = [];
  const PAGE = 1000;
  let from = 0;
  for (;;) {
    const { data, error } = await s
      .from('keyword_rankings')
      .select('keyword_id, rank_position, snapshot_date')
      .eq('influencer_id', inf.id)
      .gte('snapshot_date', since)
      .order('snapshot_date', { ascending: false })
      .range(from, from + PAGE - 1);
    if (error) { console.error('kr error', error); break; }
    rows.push(...(data || []));
    if (!data || data.length < PAGE) break;
    from += PAGE;
  }
  return { since, rows };
}

function distribution(rows) {
  const seen = new Set();
  const latest = [];
  for (const r of rows) {
    if (seen.has(r.keyword_id)) continue;
    seen.add(r.keyword_id);
    latest.push(r);
  }
  const b = { total: latest.length, r1:0,r2:0,r3:0,r4:0,r5:0,r6_10:0,r11_20:0,r21_30:0,r30p:0,top3:0,top10:0 };
  for (const r of latest) {
    const p = r.rank_position;
    if (p === 1) b.r1++; else if (p === 2) b.r2++; else if (p === 3) b.r3++;
    else if (p === 4) b.r4++; else if (p === 5) b.r5++;
    else if (p <= 10) b.r6_10++; else if (p <= 20) b.r11_20++;
    else if (p <= 30) b.r21_30++; else b.r30p++;
    if (p <= 3) b.top3++;
    if (p <= 10) b.top10++;
  }
  return b;
}

for (const days of [7, 30, 90]) {
  const { since, rows } = await pullRankings(days);
  const d = distribution(rows);
  log(`\n==== DB: keyword_rankings dedup dist (since ${since}, ${days}d, raw rows=${rows.length}) ====`);
  log(`  고유키워드(순위보유): ${d.total}  | TOP3: ${d.top3}  TOP10: ${d.top10}`);
  log(`  1위:${d.r1} 2위:${d.r2} 3위:${d.r3} 4위:${d.r4} 5위:${d.r5} 6~10:${d.r6_10} 11~20:${d.r11_20} 21~30:${d.r21_30} 30+:${d.r30p}`);
}

// 5) live Naver home — subscriberCount + topicCount ground truth
log('\n==== LIVE: in.naver.com/' + naverId + ' ====');
try {
  const res = await fetch(`https://in.naver.com/${naverId}`, {
    headers: { 'User-Agent': UA, 'Accept-Language': 'ko-KR,ko;q=0.9', Referer: 'https://in.naver.com/' },
  });
  log('http status       :', res.status);
  const html = await res.text();
  const idx = html.indexOf('__PRELOADED_STATE__');
  if (idx !== -1) {
    const jsonStart = html.indexOf('{', idx);
    let depth = 0, end = -1;
    for (let i = jsonStart; i < html.length; i++) {
      if (html[i] === '{') depth++;
      if (html[i] === '}') { depth--; if (depth === 0) { end = i + 1; break; } }
    }
    if (end !== -1) {
      const state = JSON.parse(html.substring(jsonStart, end));
      const d = state?.space?.data || {};
      log('subscriberCount(stats):', d?.stats?.subscriberCount);
      log('subscriberCount(legacy):', d?.subscriberCount);
      log('totalFollowerCount     :', d?.totalFollowerCount);
      log('ownerId                :', d?.ownerId);
      log('stats keys             :', d?.stats ? Object.keys(d.stats) : null);
      log('data keys              :', Object.keys(d));
    }
  } else {
    log('[warn] __PRELOADED_STATE__ not found in HTML (len=' + html.length + ')');
  }
  const tMatch = html.match(/토픽\s*(\d+)/);
  const tJson = html.match(/"topicCount"\s*:\s*(\d+)/);
  log('regex 토픽 match       :', tMatch ? tMatch[1] : 'NONE');
  log('regex topicCount json  :', tJson ? tJson[1] : 'NONE');
} catch (e) {
  log('[error] live fetch failed:', e.message);
}

// 6) live topic page via Apollo (what crawler uses)
log('\n==== LIVE: in.naver.com/' + naverId + '/topic (Apollo) ====');
try {
  const res = await fetch(`https://in.naver.com/${naverId}/topic`, {
    headers: { 'User-Agent': UA, 'Accept-Language': 'ko-KR,ko;q=0.9', Referer: `https://in.naver.com/${naverId}` },
  });
  log('http status       :', res.status);
  const html = await res.text();
  const apolloIdx = html.indexOf('__APOLLO_STATE__');
  log('has __APOLLO_STATE__:', apolloIdx !== -1);
  const tcMatch = html.match(/"topicCount"\s*:\s*(\d+)/);
  log('regex topicCount   :', tcMatch ? tcMatch[1] : 'NONE');
} catch (e) {
  log('[error] topic fetch failed:', e.message);
}

process.exit(0);
