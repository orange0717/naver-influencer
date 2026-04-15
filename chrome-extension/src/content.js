/**
 * N인플 키워드 분석 — Content Script v1.1
 * 네이버 검색 페이지: 플로팅 뱃지 + 메시지 핸들러
 * 네이버 블로그 페이지: 페이지 데이터 추출 + 메시지 핸들러
 */

const API_BASE = 'https://naver-influencer.vercel.app';
const BADGE_ID = 'ninfl-search-badge';

/* ══════════════════════════════════════
   메시지 핸들러 (Side Panel / background 통신용)
   ══════════════════════════════════════ */
chrome.runtime.onMessage.addListener(function (msg, sender, sendResponse) {
  if (msg.type === 'get-page-data') {
    sendResponse(extractPageData());
    return false;
  }

  if (msg.type === 'get-selection') {
    var sel = window.getSelection();
    sendResponse({ text: sel ? sel.toString().trim() : '' });
    return false;
  }
});

/* ── 페이지 데이터 추출 ── */
function extractPageData() {
  var url = window.location.href;
  var data = { url: url, type: 'unknown' };

  // 네이버 검색 페이지
  if (url.indexOf('search.naver.com') !== -1) {
    var params = new URLSearchParams(window.location.search);
    data.type = 'naver-search';
    data.keyword = params.get('query') || params.get('q') || '';
    return data;
  }

  // 네이버 블로그 페이지
  if (url.indexOf('blog.naver.com') !== -1) {
    data.type = 'naver-blog';
    var pathParts = window.location.pathname.split('/').filter(Boolean);
    if (pathParts.length >= 1) data.blogId = pathParts[0];
    if (pathParts.length >= 2) data.postId = pathParts[1];

    var titleEl = document.querySelector('.se-title-text')
      || document.querySelector('.pcol1 .itemSubjectBol498')
      || document.querySelector('title');
    if (titleEl) data.title = titleEl.textContent.trim();

    return data;
  }

  return data;
}

/* ── 페이지 로드 시 Side Panel에 데이터 전달 ── */
(function () {
  var pageData = extractPageData();
  if (pageData.type !== 'unknown') {
    try {
      chrome.runtime.sendMessage({ type: 'page-data', data: pageData });
    } catch (e) { /* Side Panel 안 열려 있으면 무시 */ }
  }
})();

/* ══════════════════════════════════════
   슬림 바: 글자수 + 키워드 검색량
   ══════════════════════════════════════ */
var SLIM_BAR_ID = 'ninfl-slim-bar';
var _slimBar = null;
var _slimEditor = null;
var _slimTimer = null;
var _slimLastText = '';
var _kwCache = {};

function createSlimBar() {
  if (_slimBar) return _slimBar;

  var style = document.createElement('style');
  style.textContent = '#' + SLIM_BAR_ID + '{all:initial;display:flex;align-items:center;padding:7px 14px;background:#F2D9D0;border-bottom:1px solid #E8C4B8;font-family:-apple-system,BlinkMacSystemFont,"Noto Sans KR",sans-serif;font-size:11px;gap:10px;z-index:2147483646;position:relative;}'
    + '#' + SLIM_BAR_ID + ' .ni-logo{background:#BF8984;color:#fff;padding:1px 5px;border-radius:3px;font-size:9px;font-weight:800;}'
    + '#' + SLIM_BAR_ID + ' .ni-chars{color:#6B4F4A;font-weight:600;}'
    + '#' + SLIM_BAR_ID + ' .ni-sep{color:#D4AFA6;}'
    + '#' + SLIM_BAR_ID + ' .ni-chars-sub{color:#8C6B64;font-weight:500;}'
    + '#' + SLIM_BAR_ID + ' .ni-divider{width:1px;height:14px;background:#D4AFA6;}'
    + '#' + SLIM_BAR_ID + ' .ni-keywords{display:flex;align-items:center;gap:8px;flex:1;overflow:hidden;}'
    + '#' + SLIM_BAR_ID + ' .ni-kw-low{color:#059669;font-weight:600;}'
    + '#' + SLIM_BAR_ID + ' .ni-kw-medium{color:#D97706;font-weight:600;}'
    + '#' + SLIM_BAR_ID + ' .ni-kw-high{color:#DC2626;font-weight:600;}'
    + '#' + SLIM_BAR_ID + ' .ni-kw-vol{color:#8C6B64;font-weight:400;}'
    + '#' + SLIM_BAR_ID + ' .ni-loading{color:#8C6B64;font-weight:500;}'
    + '#' + SLIM_BAR_ID + ' .ni-close{color:#BF8984;font-size:9px;cursor:pointer;border:none;background:none;padding:2px 4px;font-family:inherit;}'
    + '#' + SLIM_BAR_ID + ' .ni-close:hover{color:#A0706A;}';
  document.head.appendChild(style);

  _slimBar = document.createElement('div');
  _slimBar.id = SLIM_BAR_ID;
  _slimBar.innerHTML = '<span class="ni-logo">N</span>'
    + '<span class="ni-chars" id="ni-char-count">0자</span>'
    + '<span class="ni-sep">|</span>'
    + '<span class="ni-chars-sub" id="ni-char-nospace">공백제외 0자</span>'
    + '<span class="ni-divider"></span>'
    + '<span class="ni-keywords" id="ni-keywords"><span class="ni-loading">키워드 분석 대기 중...</span></span>'
    + '<button class="ni-close" id="ni-close">✕</button>';

  _slimBar.querySelector('#ni-close').addEventListener('click', function (e) {
    e.stopPropagation();
    removeSlimBar();
  });

  return _slimBar;
}

function insertSlimBar(editorEl) {
  var bar = createSlimBar();
  if (bar.parentNode) bar.parentNode.removeChild(bar);
  editorEl.parentNode.insertBefore(bar, editorEl);
  bar.style.display = 'flex';
}

function removeSlimBar() {
  if (_slimBar && _slimBar.parentNode) _slimBar.parentNode.removeChild(_slimBar);
  _slimEditor = null;
}

function updateSlimCharCount(text) {
  if (!_slimBar) return;
  var total = text.length;
  var noSpace = text.replace(/\s/g, '').length;
  var charEl = _slimBar.querySelector('#ni-char-count');
  var nospaceEl = _slimBar.querySelector('#ni-char-nospace');
  if (charEl) charEl.textContent = total + '자';
  if (nospaceEl) nospaceEl.textContent = '공백제외 ' + noSpace + '자';
}

function extractKeywordsFromText(text) {
  // 한글 단어 추출 (2글자 이상), 빈도 계산
  var words = text.match(/[가-힣]{2,}/g) || [];
  var freq = {};
  words.forEach(function (w) { freq[w] = (freq[w] || 0) + 1; });
  // 2회 이상 등장한 단어를 빈도 순으로 정렬
  var sorted = Object.keys(freq).filter(function (k) { return freq[k] >= 2; })
    .sort(function (a, b) { return freq[b] - freq[a]; });
  return sorted.slice(0, 5);
}

function updateSlimKeywords(keywords) {
  if (!_slimBar) return;
  var kwEl = _slimBar.querySelector('#ni-keywords');
  if (!kwEl) return;

  if (keywords.length === 0) {
    kwEl.innerHTML = '<span class="ni-loading">키워드 분석 대기 중...</span>';
    return;
  }

  kwEl.innerHTML = '<span class="ni-loading">검색량 조회 중...</span>';

  // 각 키워드의 검색량 조회
  var pending = keywords.length;
  var results = [];

  keywords.forEach(function (kw) {
    if (_kwCache[kw]) {
      results.push(_kwCache[kw]);
      pending--;
      if (pending === 0) renderSlimKeywords(results);
      return;
    }
    chrome.runtime.sendMessage({ type: 'fetch-search-volume', keyword: kw }, function (resp) {
      var data = resp && resp.data ? resp.data : resp;
      var vol = null;
      if (data && data.keywords && data.keywords.length > 0) {
        var match = data.keywords.find(function (k) {
          return (k.keyword || k.relKeyword || '').toLowerCase() === kw.toLowerCase();
        }) || data.keywords[0];
        var pc = parseVol(match.monthlyPcQcCnt || match.monthlyPc);
        var mobile = parseVol(match.monthlyMobileQcCnt || match.monthlyMobile);
        var total = pc + mobile;
        var comp = match.competition || getCompLevel(match.compIdx);
        vol = { keyword: kw, total: total, competition: comp };
      } else {
        vol = { keyword: kw, total: 0, competition: '낮음' };
      }
      _kwCache[kw] = vol;
      results.push(vol);
      pending--;
      if (pending === 0) renderSlimKeywords(results);
    });
  });
}

function renderSlimKeywords(results) {
  if (!_slimBar) return;
  var kwEl = _slimBar.querySelector('#ni-keywords');
  if (!kwEl) return;

  var html = results.map(function (r) {
    var cls = r.competition === '높음' ? 'ni-kw-high' : r.competition === '중간' ? 'ni-kw-medium' : 'ni-kw-low';
    return '<span class="' + cls + '">' + escapeHtml(r.keyword)
      + ' <span class="ni-kw-vol">' + formatNum(r.total) + '</span></span>';
  }).join('');

  kwEl.innerHTML = html;
}

function getSlimEditorText(el) {
  if (!el) return '';
  if (el.tagName === 'TEXTAREA' || el.tagName === 'INPUT') return el.value || '';
  if (el.isContentEditable) return el.textContent || '';
  return '';
}

function onSlimEditorInput() {
  if (!_slimEditor) return;
  clearTimeout(_slimTimer);
  _slimTimer = setTimeout(function () {
    var text = getSlimEditorText(_slimEditor);
    if (text === _slimLastText) return;
    _slimLastText = text;
    updateSlimCharCount(text);

    if (text.replace(/\s/g, '').length >= 10 && /[\uAC00-\uD7AF]/.test(text)) {
      var keywords = extractKeywordsFromText(text);
      if (keywords.length > 0) {
        updateSlimKeywords(keywords);
      } else {
        var kwEl = _slimBar ? _slimBar.querySelector('#ni-keywords') : null;
        if (kwEl) kwEl.innerHTML = '<span class="ni-loading">2회 이상 등장한 키워드 없음</span>';
      }
    }
  }, 1000);
}

function attachSlimBar(el) {
  if (_slimEditor === el) return;
  _slimEditor = el;
  _slimLastText = '';

  insertSlimBar(el);
  var text = getSlimEditorText(el);
  updateSlimCharCount(text);

  if (text.replace(/\s/g, '').length >= 10 && /[\uAC00-\uD7AF]/.test(text)) {
    var keywords = extractKeywordsFromText(text);
    if (keywords.length > 0) updateSlimKeywords(keywords);
  }
}

/* ── 에디터 감지 ── */
document.addEventListener('focusin', function (e) {
  var el = e.target;
  if (!el) return;
  if (el.closest && el.closest('#' + SLIM_BAR_ID)) return;
  if (el.closest && el.closest('#' + BADGE_ID)) return;

  var isEditor = false;
  if (el.tagName === 'TEXTAREA') isEditor = true;
  if (el.tagName === 'INPUT' && el.type === 'text' && el.offsetWidth > 200) isEditor = true;
  if (el.isContentEditable) isEditor = true;

  if (isEditor) attachSlimBar(el);
}, true);

document.addEventListener('input', function (e) {
  if (_slimEditor && (e.target === _slimEditor || _slimEditor.contains(e.target))) {
    onSlimEditorInput();
  }
}, true);

var _slimMutObs = new MutationObserver(function () {
  if (_slimEditor && _slimEditor.isContentEditable) onSlimEditorInput();
});

document.addEventListener('focusin', function (e) {
  if (e.target && e.target.isContentEditable) {
    _slimMutObs.disconnect();
    _slimMutObs.observe(e.target, { childList: true, subtree: true, characterData: true });
  }
}, true);

// 이미 삽입된 배지가 있으면 제거
function removeBadge() {
  const existing = document.getElementById(BADGE_ID);
  if (existing) existing.remove();
}

// 현재 검색 키워드 추출
function getSearchKeyword() {
  const params = new URLSearchParams(window.location.search);
  return params.get('query') || params.get('q') || '';
}

// 검색량 API 호출 (background 경유 — CORS 방지)
async function fetchVolume(keyword) {
  return new Promise(function (resolve) {
    chrome.runtime.sendMessage({ type: 'fetch-search-volume', keyword: keyword }, function (resp) {
      if (chrome.runtime.lastError || !resp) { resolve(null); return; }
      var data = resp.data || resp;
      if (!data || !data.keywords || data.keywords.length === 0) { resolve(null); return; }

      var exact = data.keywords.find(function (k) {
        return (k.keyword || k.relKeyword || '').toLowerCase() === keyword.toLowerCase();
      });
      var result = exact || data.keywords[0];

      var pc = parseVol(result.monthlyPcQcCnt || result.monthlyPc);
      var mobile = parseVol(result.monthlyMobileQcCnt || result.monthlyMobile);
      var total = pc + mobile;
      var competition = result.competition || getCompLevel(result.compIdx);

      resolve({ keyword: result.keyword || result.relKeyword, pc: pc, mobile: mobile, total: total, competition: competition });
    });
  });
}

function parseVol(v) {
  if (v === '< 10' || v == null) return 5;
  return typeof v === 'number' ? v : parseInt(v, 10) || 0;
}

function getCompLevel(idx) {
  if (!idx) return '낮음';
  const v = String(idx).toLowerCase();
  if (v === 'high') return '높음';
  if (v === 'medium') return '중간';
  return '낮음';
}

function formatNum(n) {
  if (n >= 10000) return Math.round(n / 10000) + '만';
  if (n >= 1000) return (n / 1000).toFixed(1) + 'K';
  return String(n);
}

// 검색결과 페이지에 배지 삽입
function insertBadge(data) {
  removeBadge();

  const compColors = {
    '낮음': { bg: '#ECFDF5', color: '#059669' },
    '중간': { bg: '#FFF7ED', color: '#D97706' },
    '높음': { bg: '#FEF2F2', color: '#DC2626' },
  };

  const comp = compColors[data.competition] || compColors['낮음'];
  const pcRatio = data.total > 0 ? Math.round((data.pc / data.total) * 100) : 50;

  const badge = document.createElement('div');
  badge.id = BADGE_ID;
  badge.innerHTML = `
    <div style="
      position: fixed;
      bottom: 20px;
      right: 20px;
      z-index: 999999;
      background: #fff;
      border: 1px solid #E8C4B8;
      border-radius: 16px;
      padding: 14px 18px;
      box-shadow: 0 4px 20px rgba(0,0,0,0.1);
      font-family: -apple-system, BlinkMacSystemFont, 'Noto Sans KR', sans-serif;
      width: 280px;
      transition: all 0.3s ease;
      cursor: pointer;
    " id="ninfl-badge-inner">
      <!-- 헤더 -->
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px;">
        <div style="display:flex;align-items:center;gap:6px;">
          <span style="background:#BF8984;color:#fff;font-size:10px;font-weight:900;padding:3px 7px;border-radius:6px;">N인플</span>
          <span style="font-size:12px;font-weight:800;color:#6B4F4A;">${escapeHtml(data.keyword)}</span>
        </div>
        <span style="font-size:9px;font-weight:700;padding:2px 8px;border-radius:10px;background:${comp.bg};color:${comp.color};">${data.competition}</span>
      </div>
      <!-- 숫자 -->
      <div style="display:flex;gap:8px;margin-bottom:8px;">
        <div style="flex:1;text-align:center;padding:8px;background:#FDF5F2;border-radius:10px;">
          <div style="font-size:18px;font-weight:900;color:#BF8984;">${formatNum(data.total)}</div>
          <div style="font-size:9px;color:#8C6B64;margin-top:2px;">총 검색량</div>
        </div>
        <div style="flex:1;text-align:center;padding:8px;background:#EFF6FF;border-radius:10px;">
          <div style="font-size:14px;font-weight:800;color:#3B82F6;">${formatNum(data.pc)}</div>
          <div style="font-size:9px;color:#9B8A82;margin-top:2px;">PC</div>
        </div>
        <div style="flex:1;text-align:center;padding:8px;background:#F5F3FF;border-radius:10px;">
          <div style="font-size:14px;font-weight:800;color:#8B5CF6;">${formatNum(data.mobile)}</div>
          <div style="font-size:9px;color:#9B8A82;margin-top:2px;">모바일</div>
        </div>
      </div>
      <!-- 비율 바 -->
      <div style="display:flex;align-items:center;gap:4px;">
        <span style="font-size:9px;color:#3B82F6;width:30px;">PC ${pcRatio}%</span>
        <div style="flex:1;height:4px;background:#F0DED8;border-radius:2px;overflow:hidden;display:flex;">
          <div style="width:${pcRatio}%;height:100%;background:#3B82F6;"></div>
          <div style="width:${100 - pcRatio}%;height:100%;background:#8B5CF6;"></div>
        </div>
        <span style="font-size:9px;color:#8B5CF6;width:40px;text-align:right;">M ${100 - pcRatio}%</span>
      </div>
      <!-- 닫기 -->
      <div style="text-align:center;margin-top:8px;">
        <span id="ninfl-close" style="font-size:10px;color:#C4B0A8;cursor:pointer;">닫기 ✕</span>
      </div>
    </div>
  `;

  document.body.appendChild(badge);

  // 닫기 버튼
  document.getElementById('ninfl-close').addEventListener('click', (e) => {
    e.stopPropagation();
    removeBadge();
  });

  // 클릭하면 상세 페이지로
  document.getElementById('ninfl-badge-inner').addEventListener('click', () => {
    window.open(`${API_BASE}/search-volume?q=${encodeURIComponent(data.keyword)}`, '_blank');
  });
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

// 메인 실행
async function main() {
  const keyword = getSearchKeyword();
  if (!keyword) return;

  const data = await fetchVolume(keyword);
  if (data) {
    insertBadge(data);
  }
}

// 페이지 로드 시 실행
main();

// SPA 네비게이션 감지 (네이버 검색은 SPA가 아니지만 만약을 위해)
let lastUrl = location.href;
const observer = new MutationObserver(() => {
  if (location.href !== lastUrl) {
    lastUrl = location.href;
    setTimeout(main, 500);
  }
});
observer.observe(document.body, { childList: true, subtree: true });
