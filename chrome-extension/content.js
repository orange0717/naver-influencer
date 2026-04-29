// N인플 키워드 분석 - Content Script v2.1.0
(function () {
  'use strict';

  var BAR_ID = 'ninfl-keyword-bar';
  var DETAIL_ID = 'ninfl-keyword-detail';
  var WIDGET_ID = 'ninfl-char-widget';
  var _settings = { keyword: true, related: true, charWidget: true };
  var _injectedBar = false;
  var _expanded = false;
  var _activeEditor = null;
  var _inputTimer = null;
  var _lastText = '';

  // ── 설정 로드 ──
  try {
    chrome.storage.local.get(['ninflKeyword', 'ninflRelated', 'ninflCharWidget'], function (r) {
      if (r.ninflKeyword === false) _settings.keyword = false;
      if (r.ninflRelated === false) _settings.related = false;
      if (r.ninflCharWidget === false) _settings.charWidget = false;
      init();
    });
    chrome.storage.onChanged.addListener(function (changes) {
      if (changes.ninflKeyword) _settings.keyword = changes.ninflKeyword.newValue !== false;
      if (changes.ninflRelated) _settings.related = changes.ninflRelated.newValue !== false;
      if (changes.ninflCharWidget) _settings.charWidget = changes.ninflCharWidget.newValue !== false;
      var w = document.getElementById(WIDGET_ID);
      if (w) w.style.display = _settings.charWidget ? '' : 'none';
    });
  } catch (e) {
    init();
  }

  function init() {
    injectStyles();
    if (isNaverSearch() && _settings.keyword) insertKeywordBar();
    if (_settings.charWidget) setupCharWidget();
  }

  // ── 네이버 검색 페이지 판별 ──
  function isNaverSearch() {
    return /^https?:\/\/(m\.)?search\.naver\.com/.test(location.href);
  }

  function getSearchQuery() {
    var params = new URLSearchParams(location.search);
    return params.get('query') || params.get('q') || '';
  }

  // ── 메시지 전송 ──
  function msgAsync(msg) {
    return new Promise(function (resolve) {
      try {
        chrome.runtime.sendMessage(msg, function (resp) {
          resolve(resp || { ok: false });
        });
      } catch (e) {
        resolve({ ok: false, error: e.message });
      }
    });
  }

  // ── 숫자 포맷 ──
  function formatVolume(v) {
    if (v === undefined || v === null) return '-';
    var n = typeof v === 'string' ? parseInt(v.replace(/[<,\s]/g, ''), 10) : v;
    if (isNaN(n) || n <= 0) return '< 10';
    if (n >= 10000) return (n / 10000).toFixed(1).replace(/\.0$/, '') + '만';
    if (n >= 1000) return (n / 1000).toFixed(1).replace(/\.0$/, '') + 'K';
    return n.toLocaleString();
  }

  function parseVolume(v) {
    if (v === undefined || v === null) return 0;
    if (typeof v === 'number') return v;
    var s = String(v).replace(/[<,\s]/g, '');
    var n = parseInt(s, 10);
    return isNaN(n) ? 0 : n;
  }

  // ── 경쟁도 ──
  function getCompLevel(item) {
    var ci = (item.compIdx || item.competition || '').toLowerCase();
    if (ci === 'high' || ci === '높음') return { label: '높음', cls: 'ninfl-comp-high' };
    if (ci === 'medium' || ci === '중간') return { label: '중간', cls: 'ninfl-comp-medium' };
    return { label: '낮음', cls: 'ninfl-comp-low' };
  }

  function escHtml(s) {
    var d = document.createElement('div');
    d.textContent = s;
    return d.innerHTML;
  }

  // ── CSS 주입 ──
  function injectStyles() {
    if (document.getElementById('ninfl-styles')) return;
    var style = document.createElement('style');
    style.id = 'ninfl-styles';
    style.textContent = '\
/* 슬림바 */\
#' + BAR_ID + ' {\
  all: initial;\
  display: flex;\
  align-items: center;\
  padding: 8px 14px;\
  margin: 8px 0;\
  background: #F29C6B;\
  border-radius: 8px;\
  font-family: -apple-system, BlinkMacSystemFont, "Noto Sans KR", sans-serif;\
  font-size: 13px;\
  color: #fff;\
  cursor: pointer;\
  z-index: 2147483646;\
  position: relative;\
  gap: 0;\
  transition: box-shadow 0.2s;\
}\
#' + BAR_ID + ':hover { box-shadow: 0 2px 8px rgba(242,156,107,0.4); }\
#' + BAR_ID + ' * {\
  font-family: -apple-system, BlinkMacSystemFont, "Noto Sans KR", sans-serif;\
  box-sizing: border-box;\
}\
.ninfl-bar-logo {\
  width: 20px; height: 20px;\
  background: rgba(255,255,255,0.25);\
  border-radius: 4px;\
  display: flex; align-items: center; justify-content: center;\
  font-weight: 900; color: #fff; font-size: 11px;\
  margin-right: 8px; flex-shrink: 0;\
}\
.ninfl-bar-kw {\
  font-weight: 800; font-size: 13px; color: #fff;\
  margin-right: 10px;\
}\
.ninfl-bar-sep {\
  width: 1px; height: 14px; background: rgba(255,255,255,0.3);\
  margin: 0 10px; flex-shrink: 0;\
}\
.ninfl-bar-item {\
  font-size: 12px; color: rgba(255,255,255,0.9); font-weight: 600;\
  margin-right: 6px; white-space: nowrap;\
}\
.ninfl-bar-item strong {\
  color: #fff; font-weight: 800;\
}\
.ninfl-comp-low { color: #D1FAE5; }\
.ninfl-comp-medium { color: #FEF3C7; }\
.ninfl-comp-high { color: #FECACA; }\
.ninfl-bar-toggle {\
  margin-left: auto;\
  font-size: 11px; color: rgba(255,255,255,0.7);\
  font-weight: 600; white-space: nowrap;\
}\
.ninfl-bar-arrow {\
  display: inline-block; transition: transform 0.2s;\
  margin-left: 4px;\
}\
.ninfl-bar-arrow.open { transform: rotate(180deg); }\
\
/* 상세 패널 */\
#' + DETAIL_ID + ' {\
  all: initial;\
  display: none;\
  margin: 0 0 8px 0;\
  padding: 16px 18px;\
  background: #fff;\
  border: 1px solid #F29C6B;\
  border-radius: 0 0 10px 10px;\
  margin-top: -6px;\
  font-family: -apple-system, BlinkMacSystemFont, "Noto Sans KR", sans-serif;\
  color: #333;\
  z-index: 2147483645;\
  position: relative;\
  box-shadow: 0 4px 12px rgba(242,156,107,0.1);\
}\
#' + DETAIL_ID + ' * { box-sizing: border-box; font-family: -apple-system, BlinkMacSystemFont, "Noto Sans KR", sans-serif; }\
#' + DETAIL_ID + '.open { display: block; }\
\
.ninfl-d-stats {\
  display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 8px; margin-bottom: 12px;\
}\
.ninfl-d-stat {\
  text-align: center; padding: 10px 4px;\
  background: #FFF8F3; border-radius: 8px;\
}\
.ninfl-d-stat-value {\
  font-size: 18px; font-weight: 900; color: #F29C6B;\
}\
.ninfl-d-stat-value.pc { color: #3B82F6; }\
.ninfl-d-stat-value.mobile { color: #8B5CF6; }\
.ninfl-d-stat-label {\
  font-size: 10px; color: #9B8A82; margin-top: 3px; font-weight: 600;\
}\
\
.ninfl-d-ratio {\
  display: flex; align-items: center; gap: 8px; margin-bottom: 4px;\
}\
.ninfl-d-ratio-bar {\
  flex: 1; height: 6px; background: #eee; border-radius: 3px; overflow: hidden; display: flex;\
}\
.ninfl-d-ratio-pc { height: 100%; background: #3B82F6; }\
.ninfl-d-ratio-mobile { height: 100%; background: #8B5CF6; }\
.ninfl-d-ratio-labels {\
  display: flex; justify-content: space-between;\
  font-size: 10px; color: #9B8A82; margin-bottom: 12px;\
}\
\
.ninfl-d-related-title {\
  font-size: 12px; font-weight: 700; color: #6B5B54;\
  margin-bottom: 8px; padding-top: 10px;\
  border-top: 1px solid #F0E6E0;\
}\
.ninfl-d-related-list { display: flex; flex-wrap: wrap; gap: 6px; }\
.ninfl-d-related-item {\
  display: inline-flex; align-items: center; gap: 4px;\
  padding: 5px 10px;\
  background: #FFF8F3; border: 1px solid #F0E6E0; border-radius: 20px;\
  font-size: 12px; color: #4B3B36;\
  cursor: pointer; transition: all 0.15s;\
  text-decoration: none;\
}\
.ninfl-d-related-item:hover { background: #F29C6B; color: #fff; border-color: #F29C6B; }\
.ninfl-d-related-vol { font-size: 10px; color: #9B8A82; font-weight: 600; }\
.ninfl-d-related-item:hover .ninfl-d-related-vol { color: rgba(255,255,255,0.8); }\
\
.ninfl-d-footer {\
  text-align: center; margin-top: 12px; padding-top: 10px;\
  border-top: 1px solid #F0E6E0;\
}\
.ninfl-d-footer a {\
  font-size: 11px; color: #F29C6B; text-decoration: none; font-weight: 600;\
}\
.ninfl-d-footer a:hover { text-decoration: underline; }\
\
/* 트렌드 */\
.ninfl-trend-up { color: #059669; }\
.ninfl-trend-down { color: #DC2626; }\
.ninfl-trend-stable { color: rgba(255,255,255,0.6); }\
.ninfl-d-trend {\
  display: flex; align-items: center; gap: 8px;\
  padding: 8px 12px; margin-bottom: 12px;\
  background: #FFF8F3; border-radius: 8px;\
  font-size: 12px; color: #6B5B54; font-weight: 600;\
}\
.ninfl-d-trend-up { color: #059669; }\
.ninfl-d-trend-down { color: #DC2626; }\
.ninfl-d-trend-stable { color: #9B8A82; }\
\
/* 경쟁도 점수 바 */\
.ninfl-d-comp { margin-bottom: 12px; }\
.ninfl-d-comp-header {\
  display: flex; justify-content: space-between; align-items: center;\
  font-size: 12px; font-weight: 600; color: #6B5B54; margin-bottom: 6px;\
}\
.ninfl-d-comp-bar {\
  height: 8px; background: #eee; border-radius: 4px; overflow: hidden;\
}\
.ninfl-d-comp-fill {\
  height: 100%; border-radius: 4px; transition: width 0.5s;\
}\
.ninfl-d-comp-info {\
  display: flex; justify-content: space-between;\
  font-size: 10px; color: #9B8A82; margin-top: 4px;\
}\
\
/* 연관검색어 경쟁도 뱃지 */\
.ninfl-d-related-comp {\
  font-size: 9px; font-weight: 700; padding: 1px 5px; border-radius: 8px; margin-left: 2px;\
}\
.ninfl-d-related-comp.low { background: #ECFDF5; color: #059669; }\
.ninfl-d-related-comp.medium { background: #FFF7ED; color: #D97706; }\
.ninfl-d-related-comp.high { background: #FEF2F2; color: #DC2626; }\
\
/* 글자수 위젯 */\
#' + WIDGET_ID + ' {\
  all: initial;\
  display: none;\
  padding: 5px 14px;\
  background: #F29C6B;\
  color: #fff;\
  border-radius: 4px;\
  font-size: 12px;\
  font-weight: 600;\
  font-family: -apple-system, BlinkMacSystemFont, "Noto Sans KR", sans-serif;\
  z-index: 2147483646;\
  position: relative;\
  margin: 0 0 2px 0;\
}\
#' + WIDGET_ID + ' span {\
  font-family: -apple-system, BlinkMacSystemFont, "Noto Sans KR", sans-serif;\
  font-size: 12px; font-weight: 600; color: #fff;\
}\
.ninfl-w-sep { margin: 0 6px; opacity: 0.5; }\
';
    document.head.appendChild(style);
  }

  // ══════════════════════════════════════════
  // 1. 키워드 분석 슬림바 (네이버 검색 페이지)
  // ══════════════════════════════════════════

  function insertKeywordBar() {
    if (_injectedBar) return;
    var query = getSearchQuery();
    if (!query) return;
    _injectedBar = true;

    // 슬림바
    var bar = document.createElement('div');
    bar.id = BAR_ID;
    bar.innerHTML = '\
<div class="ninfl-bar-logo">N</div>\
<span class="ninfl-bar-kw" id="ninfl-bar-kw">' + escHtml(query) + '</span>\
<div class="ninfl-bar-sep"></div>\
<span class="ninfl-bar-item" id="ninfl-bar-vol">검색량 --</span>\
<div class="ninfl-bar-sep"></div>\
<span class="ninfl-bar-item" id="ninfl-bar-ratio">PC --% / 모바일 --%</span>\
<div class="ninfl-bar-sep"></div>\
<span class="ninfl-bar-item" id="ninfl-bar-comp">경쟁도 --</span>\
<div class="ninfl-bar-sep"></div>\
<span class="ninfl-bar-item" id="ninfl-bar-related">연관 --개</span>\
<span class="ninfl-bar-toggle" id="ninfl-bar-toggle">펼치기 <span class="ninfl-bar-arrow" id="ninfl-bar-arrow">&#9660;</span></span>';

    // 상세 패널
    var detail = document.createElement('div');
    detail.id = DETAIL_ID;
    detail.innerHTML = '<div style="text-align:center;padding:12px;color:#9B8A82;font-size:12px;">로딩 중...</div>';

    // 삽입 위치
    var anchor = document.getElementById('main_pack') || document.querySelector('.content_wrap') || document.querySelector('#content');
    if (anchor && anchor.parentNode) {
      anchor.parentNode.insertBefore(detail, anchor);
      anchor.parentNode.insertBefore(bar, detail);
    } else {
      document.body.insertBefore(detail, document.body.firstChild);
      document.body.insertBefore(bar, detail);
    }

    // 클릭으로 펼치기/접기
    bar.addEventListener('click', function () {
      _expanded = !_expanded;
      var d = document.getElementById(DETAIL_ID);
      var arrow = document.getElementById('ninfl-bar-arrow');
      var toggle = document.getElementById('ninfl-bar-toggle');
      if (d) {
        if (_expanded) {
          d.classList.add('open');
        } else {
          d.classList.remove('open');
        }
      }
      if (arrow) {
        if (_expanded) {
          arrow.classList.add('open');
        } else {
          arrow.classList.remove('open');
        }
      }
      if (toggle) toggle.firstChild.textContent = _expanded ? '접기 ' : '펼치기 ';
    });

    // API 호출
    fetchKeywordData(query);
  }

  function fetchKeywordData(query) {
    msgAsync({ type: 'fetch-keyword-analysis', keyword: query }).then(function (resp) {
      if (!resp || !resp.ok || !resp.data || resp.data.error) {
        var elVol = document.getElementById('ninfl-bar-vol');
        if (elVol) elVol.textContent = '데이터 없음';
        return;
      }

      var d = resp.data;
      var total = d.volume.total;
      var pc = d.volume.pc;
      var mobile = d.volume.mobile;
      var pcPct = total > 0 ? Math.round((pc / total) * 100) : 50;
      var mobilePct = 100 - pcPct;
      var comp = d.competition;
      var trend = d.trend;
      var related = d.related || [];

      // 트렌드 표시
      var trendArrow = '';
      var trendCls = 'ninfl-trend-stable';
      if (trend.direction === 'up') { trendArrow = ' ▲' + Math.abs(trend.change) + '%'; trendCls = 'ninfl-trend-up'; }
      else if (trend.direction === 'down') { trendArrow = ' ▼' + Math.abs(trend.change) + '%'; trendCls = 'ninfl-trend-down'; }

      // 경쟁도 CSS 클래스
      var compCls = 'ninfl-comp-low';
      if (comp.level === '높음') compCls = 'ninfl-comp-high';
      else if (comp.level === '중간') compCls = 'ninfl-comp-medium';

      // 슬림바 업데이트
      var elVol = document.getElementById('ninfl-bar-vol');
      var elRatio = document.getElementById('ninfl-bar-ratio');
      var elComp = document.getElementById('ninfl-bar-comp');
      var elRelated = document.getElementById('ninfl-bar-related');

      if (elVol) elVol.innerHTML = '<strong>' + formatVolume(total) + '</strong><span class="' + trendCls + '" style="font-size:10px;margin-left:3px;">' + trendArrow + '</span>';
      if (elRatio) elRatio.textContent = 'PC ' + pcPct + '% / 모바일 ' + mobilePct + '%';
      if (elComp) elComp.innerHTML = '경쟁도 <span class="' + compCls + '">' + comp.level + '</span><span style="font-size:10px;opacity:0.7;">(' + comp.score + ')</span>';
      if (elRelated) elRelated.textContent = '연관 ' + related.length + '개';

      // 상세 패널 업데이트
      var detail = document.getElementById(DETAIL_ID);
      if (!detail) return;

      var html = '';

      // 검색량 카드 3칸
      html += '<div class="ninfl-d-stats">';
      html += '<div class="ninfl-d-stat"><div class="ninfl-d-stat-value">' + formatVolume(total) + '</div><div class="ninfl-d-stat-label">월간 검색량</div></div>';
      html += '<div class="ninfl-d-stat"><div class="ninfl-d-stat-value pc">' + formatVolume(pc) + '</div><div class="ninfl-d-stat-label">PC</div></div>';
      html += '<div class="ninfl-d-stat"><div class="ninfl-d-stat-value mobile">' + formatVolume(mobile) + '</div><div class="ninfl-d-stat-label">모바일</div></div>';
      html += '</div>';

      // 트렌드 카드
      var trendIcon = trend.direction === 'up' ? '▲' : trend.direction === 'down' ? '▼' : '-';
      var trendColor = trend.direction === 'up' ? 'ninfl-d-trend-up' : trend.direction === 'down' ? 'ninfl-d-trend-down' : 'ninfl-d-trend-stable';
      var trendText = trend.direction === 'up' ? '상승' : trend.direction === 'down' ? '하락' : '안정';
      html += '<div class="ninfl-d-trend">최근 30일 <span class="' + trendColor + '">' + trendIcon + ' ' + Math.abs(trend.change) + '% ' + trendText + '</span>';
      if (comp.participants > 0) html += ' &middot; 참여자 ' + comp.participants + '명';
      html += '</div>';

      // 비율 바
      html += '<div class="ninfl-d-ratio"><div class="ninfl-d-ratio-bar"><div class="ninfl-d-ratio-pc" style="width:' + pcPct + '%"></div><div class="ninfl-d-ratio-mobile" style="width:' + mobilePct + '%"></div></div></div>';
      html += '<div class="ninfl-d-ratio-labels"><span>PC ' + pcPct + '%</span><span>모바일 ' + mobilePct + '%</span></div>';

      // 경쟁도 점수 바 (값 범위 제한)
      var safeScore = Math.max(0, Math.min(100, parseInt(comp.score, 10) || 0));
      var compBarColor = safeScore >= 60 ? '#DC2626' : safeScore >= 30 ? '#D97706' : '#059669';
      html += '<div class="ninfl-d-comp">';
      html += '<div class="ninfl-d-comp-header"><span>경쟁도</span><span>' + escHtml(comp.level) + ' (' + safeScore + '/100)</span></div>';
      html += '<div class="ninfl-d-comp-bar"><div class="ninfl-d-comp-fill" style="width:' + safeScore + '%;background:' + compBarColor + ';"></div></div>';
      html += '<div class="ninfl-d-comp-info"><span>낮음</span><span>중간</span><span>높음</span></div>';
      html += '</div>';

      // 연관검색어
      if (_settings.related && related.length > 0) {
        html += '<div class="ninfl-d-related-title">연관검색어</div>';
        html += '<div class="ninfl-d-related-list">';
        for (var i = 0; i < related.length; i++) {
          var kw = related[i];
          var url = 'https://search.naver.com/search.naver?query=' + encodeURIComponent(kw.keyword);
          var kwCompCls = kw.competition === '높음' ? 'high' : kw.competition === '중간' ? 'medium' : 'low';
          html += '<a class="ninfl-d-related-item" href="' + url + '" target="_self">';
          html += escHtml(kw.keyword);
          html += ' <span class="ninfl-d-related-vol">' + formatVolume(kw.total) + '</span>';
          html += '<span class="ninfl-d-related-comp ' + kwCompCls + '">' + kw.competition + '</span>';
          html += '</a>';
        }
        html += '</div>';
      }

      html += '<div class="ninfl-d-footer"><a href="https://ninfle.kr" target="_blank">N인플 대시보드에서 더 보기 &rarr;</a></div>';

      detail.innerHTML = html;
    });
  }

  // ══════════════════════════════════════════
  // 2. 글자수세기 위젯
  // ══════════════════════════════════════════

  function setupCharWidget() {
    document.addEventListener('focusin', function (e) {
      var el = e.target;
      if (el.closest && (el.closest('#' + WIDGET_ID) || el.closest('#' + BAR_ID))) return;
      var isEditor = false;
      if (el.tagName === 'TEXTAREA') isEditor = true;
      if (el.tagName === 'INPUT' && el.type === 'text' && el.offsetWidth > 200) {
        // 네이버 검색창은 제외 (글자수 위젯 부적절)
        var isSearch = el.name === 'query' || el.name === 'q'
          || el.id === 'query' || el.id === 'nx_query'
          || el.getAttribute('role') === 'combobox'
          || (el.closest && el.closest('form[action*="search"], #search, .search_box, .sch_area'));
        if (!isSearch) isEditor = true;
      }
      if (el.isContentEditable) isEditor = true;
      if (isEditor && el !== _activeEditor) {
        detachWidget();
        _activeEditor = el;
        attachWidget(el);
      }
    }, true);

    document.addEventListener('input', function (e) {
      if (_activeEditor && (e.target === _activeEditor || _activeEditor.contains(e.target))) {
        onEditorInput();
      }
    }, true);
  }

  function attachWidget(el) {
    var widget = document.createElement('div');
    widget.id = WIDGET_ID;
    widget.innerHTML = '<span id="ninfl-w-stroke">타자수 0타</span><span class="ninfl-w-sep">/</span><span id="ninfl-w-char">글자수 0자</span><span class="ninfl-w-sep">/</span><span id="ninfl-w-nospace">공백제외 0자</span>';
    if (!_settings.charWidget) widget.style.display = 'none';
    // 에디터 바로 아래(afterend)에 삽입
    if (el.parentNode) {
      if (el.nextSibling) el.parentNode.insertBefore(widget, el.nextSibling);
      else el.parentNode.appendChild(widget);
    }
    var text = getEditorText(el);
    if (text.length > 0) {
      updateCharWidget(text);
      widget.style.display = _settings.charWidget ? 'block' : 'none';
    }
  }

  function detachWidget() {
    var old = document.getElementById(WIDGET_ID);
    if (old) old.remove();
    _activeEditor = null;
    _lastText = '';
  }

  function onEditorInput() {
    clearTimeout(_inputTimer);
    _inputTimer = setTimeout(function () {
      if (!_activeEditor) return;
      var text = getEditorText(_activeEditor);
      if (text === _lastText) return;
      _lastText = text;
      updateCharWidget(text);
    }, 300);
  }

  function getEditorText(el) {
    if (el.tagName === 'TEXTAREA' || el.tagName === 'INPUT') return el.value || '';
    return el.innerText || el.textContent || '';
  }

  function updateCharWidget(text) {
    var widget = document.getElementById(WIDGET_ID);
    if (!widget) return;
    var chars = text.length;
    var noSpace = text.replace(/\s/g, '').length;
    var strokes = countStrokes(text);
    var elStroke = document.getElementById('ninfl-w-stroke');
    var elChar = document.getElementById('ninfl-w-char');
    var elNoSpace = document.getElementById('ninfl-w-nospace');
    if (elStroke) elStroke.textContent = '타자수 ' + strokes.toLocaleString() + '타';
    if (elChar) elChar.textContent = '글자수 ' + chars.toLocaleString() + '자';
    if (elNoSpace) elNoSpace.textContent = '공백제외 ' + noSpace.toLocaleString() + '자';
    widget.style.display = chars > 0 && _settings.charWidget ? 'block' : 'none';
  }

  function countStrokes(text) {
    var count = 0;
    for (var i = 0; i < text.length; i++) {
      var code = text.charCodeAt(i);
      if (code >= 0xAC00 && code <= 0xD7AF) {
        var jong = (code - 0xAC00) % 28;
        count += jong > 0 ? 3 : 2;
      } else if (code >= 0x3131 && code <= 0x318E) {
        count += 1;
      } else if (code > 32) {
        count += 1;
      }
    }
    return count;
  }

})();
