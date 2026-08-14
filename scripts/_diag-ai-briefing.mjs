import { requireSupabaseClient } from './_supabase-env.mjs';

const sb = requireSupabaseClient();

// 1) migration-144 적용 여부: check_status 컬럼 + 이력 테이블 존재 확인
async function checkSchema() {
  const { error: colErr } = await sb.from('ai_briefing_exposures').select('check_status').limit(1);
  const hasCheckStatus = !colErr;
  const { error: histErr } = await sb.from('ai_briefing_exposure_history').select('id').limit(1);
  const hasHistory = !histErr;
  return { hasCheckStatus, hasHistory, colErr: colErr?.message, histErr: histErr?.message };
}

async function main() {
  const schema = await checkSchema();
  console.log('=== 스키마(migration-144 적용 여부) ===');
  console.log('  check_status 컬럼:', schema.hasCheckStatus ? '✅ 있음' : `❌ 없음 (${schema.colErr})`);
  console.log('  이력 테이블:', schema.hasHistory ? '✅ 있음' : `❌ 없음 (${schema.histErr})`);

  // 2) ai_briefing_exposures 전체 현황
  const baseCols = 'user_id, blog_id, post_id, keyword, exposed, tab_exposed, checked_at';
  const cols = schema.hasCheckStatus ? baseCols + ', check_status, last_error, error_at' : baseCols;
  const { data: rows, error } = await sb
    .from('ai_briefing_exposures')
    .select(cols)
    .order('checked_at', { ascending: false, nullsFirst: false })
    .limit(2000);
  if (error) { console.error('조회 실패:', error.message); process.exit(1); }

  console.log(`\n=== ai_briefing_exposures 전체: ${rows.length}행 ===`);
  const blogs = new Set(rows.map(r => r.blog_id));
  console.log('  블로그 수:', blogs.size, '/ 포스트 수:', new Set(rows.map(r => r.post_id)).size, '/ 키워드행:', rows.length);

  const checked = rows.filter(r => r.checked_at);
  const exposedB = rows.filter(r => r.exposed).length;
  const exposedT = rows.filter(r => r.tab_exposed).length;
  console.log('  확인완료(checked_at 有):', checked.length);
  console.log('  AI 브리핑 인용(exposed):', exposedB);
  console.log('  AI 탭 인용(tab_exposed):', exposedT);

  if (schema.hasCheckStatus) {
    const byStatus = {};
    for (const r of rows) { const s = r.check_status ?? '(null=미확인)'; byStatus[s] = (byStatus[s] ?? 0) + 1; }
    console.log('  check_status 분포:', JSON.stringify(byStatus));
    const errs = rows.filter(r => r.last_error);
    if (errs.length) {
      console.log(`\n  ⚠️ 오류 기록 ${errs.length}건:`);
      for (const r of errs.slice(0, 10)) console.log(`    - [${r.check_status}] ${r.keyword} (post ${r.post_id}): ${r.last_error}`);
    }
  }

  // 3) 블로그별 대시보드 집계 미리보기 (check_status='ok'만 분모)
  console.log('\n=== 블로그별 대시보드 집계(상위 10) ===');
  const byBlog = {};
  for (const r of rows) {
    const b = r.blog_id;
    byBlog[b] ??= { posts: new Set(), kw: 0, okPosts: new Set(), bCited: 0, tCited: 0, last: null };
    const g = byBlog[b];
    g.posts.add(r.post_id); g.kw++;
    const isOk = schema.hasCheckStatus ? r.check_status === 'ok' : !!r.checked_at;
    if (isOk) {
      g.okPosts.add(r.post_id);
      if (r.exposed) g.bCited++;
      if (r.tab_exposed) g.tCited++;
    }
    if (r.checked_at && (!g.last || r.checked_at > g.last)) g.last = r.checked_at;
  }
  const sorted = Object.entries(byBlog).sort((a, b) => b[1].kw - a[1].kw).slice(0, 10);
  for (const [blog, g] of sorted) {
    const okN = g.okPosts.size;
    const bRate = okN ? Math.round((g.bCited / okN) * 1000) / 10 : 0;
    const tRate = okN ? Math.round((g.tCited / okN) * 1000) / 10 : 0;
    console.log(`  ${blog}: 포스트 ${g.posts.size} / 확인완료 ${okN} / 브리핑인용 ${g.bCited}(${bRate}%) / 탭인용 ${g.tCited}(${tRate}%) / 마지막확인 ${g.last ?? '-'}`);
  }

  // 4) 최근 확인 샘플 5건
  console.log('\n=== 최근 확인 5건 ===');
  for (const r of checked.slice(0, 5)) {
    const st = schema.hasCheckStatus ? ` [${r.check_status ?? 'null'}]` : '';
    console.log(`  ${r.checked_at?.slice(0, 16)}${st} "${r.keyword}" 브리핑=${r.exposed} 탭=${r.tab_exposed} (blog ${r.blog_id}/post ${r.post_id})`);
  }
}

main().catch(e => { console.error(e); process.exit(1); });
