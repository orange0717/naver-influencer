/* ══════════════════════════════════════════════════════
   N인플 Chrome Extension — Side Panel Logic
   키워드 분석 / 블로그 분석 / 순위 확인
   ══════════════════════════════════════════════════════ */

/* ── State ── */
var activeTab = 'keyword';
var activeRankTab = 'blog';

/* ── DOM refs ── */
function $(id) { return document.getElementById(id); }
function esc(s) { return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }

/* ══════════════════════════════════════
   Init
   ══════════════════════════════════════ */
document.addEventListener('DOMContentLoaded', function () {
  // 컨텍스트 로드 (우클릭으로 열린 경우)
  loadContext();

  // storage 변경 감지
  chrome.storage.onChanged.addListener(function (changes, area) {
    if (area === 'local') {
      if (changes.ninflContext && changes.ninflContext.newValue) loadContext();
      if (changes.ninflPageData && changes.ninflPageData.newValue) handlePageData(changes.ninflPageData.newValue);
    }
  });

  // 메인 탭 전환
  document.querySelectorAll('.sp-tab').forEach(function (tab) {
    tab.addEventListener('click', function () { switchTab(tab.dataset.tab); });
  });

  // 순위 서브 탭
  document.querySelectorAll('.sp-rank-tab').forEach(function (tab) {
    tab.addEventListener('click', function () {
      activeRankTab = tab.dataset.rtab;
      document.querySelectorAll('.sp-rank-tab').forEach(function (t) { t.classList.remove('active'); });
      tab.classList.add('active');
      checkRanking();
    });
  });

  // 검색 버튼
  $('kwSearchBtn').addEventListener('click', searchKeywords);
  $('blogSearchBtn').addEventListener('click', analyzeBlog);
  $('rankSearchBtn').addEventListener('click', checkRanking);

  // Enter 키
  $('kwInput').addEventListener('keydown', function (e) { if (e.key === 'Enter') searchKeywords(); });
  $('blogInput').addEventListener('keydown', function (e) { if (e.key === 'Enter') analyzeBlog(); });
  $('rankKwInput').addEventListener('keydown', function (e) { if (e.key === 'Enter') checkRanking(); });
});

/* ══════════════════════════════════════
   컨텍스트 로드 (우클릭 시 전달된 정보)
   ══════════════════════════════════════ */
function loadContext() {
  chrome.storage.local.get(['ninflContext'], function (data) {
    if (!data.ninflContext) return;
    var ctx = data.ninflContext;
    chrome.storage.local.remove('ninflContext');

    // 선택 텍스트가 있으면 키워드로 검색
    if (ctx.selectedText) {
      $('kwInput').value = ctx.selectedText;
      switchTab('keyword');
      searchKeywords();
      return;
    }

    // 네이버 검색 페이지
    if (ctx.pageUrl && ctx.pageUrl.indexOf('search.naver.com') !== -1) {
      try {
        var params = new URLSearchParams(new URL(ctx.pageUrl).search);
        var keyword = params.get('query') || params.get('q') || '';
        if (keyword) {
          $('kwInput').value = keyword;
          switchTab('keyword');
          searchKeywords();
          return;
        }
      } catch (e) {}
    }

    // 네이버 블로그 페이지
    if (ctx.pageUrl && ctx.pageUrl.indexOf('blog.naver.com') !== -1) {
      try {
        var pathParts = new URL(ctx.pageUrl).pathname.split('/').filter(Boolean);
        if (pathParts.length >= 1) {
          $('blogInput').value = pathParts[0];
          switchTab('blog');
          analyzeBlog();
          return;
        }
      } catch (e) {}
    }
  });
}

/* ── 페이지 데이터 처리 (content script에서 전달) ── */
function handlePageData(data) {
  if (!data) return;

  if (data.type === 'naver-search' && data.keyword) {
    if (!$('kwInput').value) {
      $('kwInput').value = data.keyword;
    }
  }

  if (data.type === 'naver-blog' && data.blogId) {
    if (!$('blogInput').value) {
      $('blogInput').value = data.blogId;
    }
  }
}

/* ══════════════════════════════════════
   탭 전환
   ══════════════════════════════════════ */
function switchTab(tab) {
  activeTab = tab;
  document.querySelectorAll('.sp-tab').forEach(function (t) {
    t.classList.toggle('active', t.dataset.tab === tab);
  });
  $('panelKeyword').style.display = tab === 'keyword' ? 'flex' : 'none';
  $('panelBlog').style.display = tab === 'blog' ? 'flex' : 'none';
  $('panelRanking').style.display = tab === 'ranking' ? 'flex' : 'none';
}

/* ══════════════════════════════════════
   키워드 검색량 분석
   ══════════════════════════════════════ */
async function searchKeywords() {
  var raw = $('kwInput').value.trim();
  if (!raw) return;

  var keywords = raw.split(',').map(function (k) { return k.trim(); })
    .filter(function (k) { return k.length > 0; }).slice(0, 5);

  if (keywords.length === 0) return;

  showLoading('kwResults', keywords.length + '개 키워드 분석 중...');

  try {
    var results = await Promise.all(keywords.map(function (kw) {
      return msgAsync({ type: 'fetch-search-volume', keyword: kw });
    }));

    renderKeywordResults(keywords, results);
  } catch (e) {
    showError('kwResults', e.message);
  }
}

function renderKeywordResults(searchedKeywords, allResults) {
  var area = $('kwResults');
  var allKw = [];

  allResults.forEach(function (resp, idx) {
    var mainKeyword = searchedKeywords[idx];
    var data = resp.data || resp;
    if (!data.keywords || data.keywords.length === 0) return;

    var mainResult = data.keywords.find(function (k) {
      return (k.keyword || k.relKeyword || '').toLowerCase() === mainKeyword.toLowerCase();
    });
    var others = data.keywords.filter(function (k) {
      return (k.keyword || k.relKeyword || '').toLowerCase() !== mainKeyword.toLowerCase();
    });

    if (mainResult) {
      allKw.push(Object.assign(normalizeKw(mainResult), { isMain: true }));
    } else if (data.keywords.length > 0) {
      allKw.push(Object.assign(normalizeKw(data.keywords[0]), { isMain: true }));
    }

    others.slice(0, 2).forEach(function (k) {
      allKw.push(Object.assign(normalizeKw(k), { isMain: false }));
    });
  });

  if (allKw.length === 0) {
    area.innerHTML = '<div class="sp-empty">검색 결과가 없습니다.</div>';
    return;
  }

  var mainCount = allKw.filter(function (k) { return k.isMain; }).length;
  var html = '<div class="sp-count">검색 키워드 <strong>' + mainCount + '개</strong></div>';

  allKw.forEach(function (kw) {
    var compClass = kw.competition === '높음' ? 'high' : kw.competition === '중간' ? 'medium' : 'low';
    var pcRatio = kw.total > 0 ? Math.round((kw.pc / kw.total) * 100) : 50;
    var cardClass = 'sp-kw-card' + (kw.isMain ? '' : ' related');

    html += '<div class="' + cardClass + '">'
      + '<div class="sp-kw-header">'
      + '<span class="sp-kw-name">' + (kw.isMain ? '' : '<span class="related-tag">연관 </span>') + esc(kw.keyword) + '</span>'
      + '<span class="sp-kw-badge ' + compClass + '">' + kw.competition + '</span>'
      + '</div>'
      + '<div class="sp-kw-stats">'
      + '<div class="sp-kw-stat"><div class="sp-kw-stat-value">' + formatNum(kw.total) + '</div><div class="sp-kw-stat-label">총 검색량</div></div>'
      + '<div class="sp-kw-stat"><div class="sp-kw-stat-value pc">' + formatNum(kw.pc) + '</div><div class="sp-kw-stat-label">PC</div></div>'
      + '<div class="sp-kw-stat"><div class="sp-kw-stat-value mobile">' + formatNum(kw.mobile) + '</div><div class="sp-kw-stat-label">모바일</div></div>'
      + '</div>'
      + '<div class="sp-kw-ratio">'
      + '<span class="sp-ratio-label" style="color:var(--blue);">PC ' + pcRatio + '%</span>'
      + '<div class="sp-ratio-bar"><div class="sp-ratio-pc" style="width:' + pcRatio + '%"></div><div class="sp-ratio-mobile" style="width:' + (100 - pcRatio) + '%"></div></div>'
      + '<span class="sp-ratio-label right" style="color:var(--purple);">M ' + (100 - pcRatio) + '%</span>'
      + '</div>'
      + '</div>';
  });

  area.innerHTML = html;
}

/* ══════════════════════════════════════
   블로그 분석
   ══════════════════════════════════════ */
async function analyzeBlog() {
  var blogId = $('blogInput').value.trim();
  if (!blogId) return;

  showLoading('blogResults', blogId + ' 블로그 분석 중...');

  try {
    var resp = await msgAsync({ type: 'fetch-blog-check-missing', blogId: blogId });
    var data = resp.data || resp;

    renderBlogResults(blogId, data);
  } catch (e) {
    showError('blogResults', e.message);
  }
}

function renderBlogResults(blogId, data) {
  var area = $('blogResults');

  if (!data || !data.results || data.results.length === 0) {
    area.innerHTML = '<div class="sp-empty">분석 결과가 없습니다.<br>블로그 ID를 확인해주세요.</div>';
    return;
  }

  var results = data.results;
  var exposed = results.filter(function (r) { return r.exposed; }).length;
  var missing = results.length - exposed;

  var html = '<div class="sp-count">'
    + '노출 <strong>' + exposed + '</strong> / 누락 <strong>' + missing + '</strong> '
    + '(' + results.length + '개 키워드)</div>';

  results.forEach(function (r) {
    var statusClass = r.exposed ? 'exposed' : 'missing';
    var statusText = r.exposed ? '노출' : '누락';

    html += '<div class="sp-blog-card">'
      + '<div class="sp-blog-card-header">'
      + '<span class="sp-blog-kw">' + esc(r.keyword || '') + '</span>'
      + '<span class="sp-blog-status ' + statusClass + '">' + statusText + '</span>'
      + '</div>';

    if (r.rank) {
      html += '<div class="sp-blog-rank">' + r.rank + '위</div>';
    }

    html += '</div>';
  });

  area.innerHTML = html;
}

/* ══════════════════════════════════════
   키워드 TOP 순위
   ══════════════════════════════════════ */
async function checkRanking() {
  var keyword = $('rankKwInput').value.trim();
  if (!keyword) return;

  showLoading('rankResults', keyword + ' 순위 확인 중...');

  try {
    var resp = await msgAsync({ type: 'fetch-blog-top', keyword: keyword, tab: activeRankTab });
    var data = resp.data || resp;

    renderRankResults(keyword, data);
  } catch (e) {
    showError('rankResults', e.message);
  }
}

function renderRankResults(keyword, data) {
  var area = $('rankResults');
  var items = data.results || data.items || [];

  if (items.length === 0) {
    area.innerHTML = '<div class="sp-empty">"' + esc(keyword) + '" 순위 결과가 없습니다.</div>';
    return;
  }

  var html = '<div class="sp-count">' + esc(keyword) + ' TOP <strong>' + items.length + '</strong></div>';

  items.forEach(function (item, i) {
    var rank = i + 1;
    var numClass = rank === 1 ? 'gold' : rank === 2 ? 'silver' : rank === 3 ? 'bronze' : 'normal';

    html += '<div class="sp-rank-item">'
      + '<div class="sp-rank-num ' + numClass + '">' + rank + '</div>'
      + '<div class="sp-rank-info">'
      + '<div class="sp-rank-title">' + esc(item.title || item.blogTitle || '') + '</div>'
      + '<div class="sp-rank-author">' + esc(item.blogName || item.author || '') + '</div>'
      + '</div>'
      + '</div>';
  });

  area.innerHTML = html;
}

/* ══════════════════════════════════════
   Helpers
   ══════════════════════════════════════ */
function normalizeKw(raw) {
  var keyword = raw.keyword || raw.relKeyword || '';
  var pc = parseVol(raw.monthlyPcQcCnt || raw.monthlyPc);
  var mobile = parseVol(raw.monthlyMobileQcCnt || raw.monthlyMobile);
  var total = pc + mobile;
  var competition = raw.competition || getCompLevel(raw.compIdx);
  return { keyword: keyword, pc: pc, mobile: mobile, total: total, competition: competition };
}

function parseVol(v) {
  if (v === '< 10' || v == null) return 5;
  return typeof v === 'number' ? v : parseInt(v, 10) || 0;
}

function getCompLevel(idx) {
  if (!idx) return '낮음';
  var v = String(idx).toLowerCase();
  if (v === 'high') return '높음';
  if (v === 'medium') return '중간';
  return '낮음';
}

function formatNum(n) {
  if (n >= 10000) return Math.round(n / 10000) + '만';
  if (n >= 1000) return (n / 1000).toFixed(1) + 'K';
  return String(n);
}

function msgAsync(msg) {
  return new Promise(function (resolve, reject) {
    chrome.runtime.sendMessage(msg, function (resp) {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
        return;
      }
      if (resp && resp.error) {
        reject(new Error(resp.error));
        return;
      }
      resolve(resp || {});
    });
  });
}

function showLoading(areaId, msg) {
  $(areaId).innerHTML = '<div class="sp-loading"><div class="sp-spinner"></div><span>' + (msg || '분석 중...') + '</span></div>';
}

function showError(areaId, msg) {
  $(areaId).innerHTML = '<div class="sp-error">' + esc(msg || '오류가 발생했습니다.') + '</div>';
}
