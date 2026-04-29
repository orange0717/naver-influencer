// N인플 키워드 분석 - Background Service Worker v2.1
var API_BASE = 'https://ninfle.kr';
var CACHE_TTL = 5 * 60 * 1000; // 5분

chrome.runtime.onMessage.addListener(function (msg, sender, sendResponse) {
  // 자신의 확장에서 온 메시지만 처리
  if (sender.id !== chrome.runtime.id) return false;

  if (msg.type === 'fetch-keyword-analysis') {
    var keyword = msg.keyword;
    var cacheKey = 'ninfl_cache_' + keyword.toLowerCase().trim();

    // 캐시 확인
    chrome.storage.local.get([cacheKey], function (r) {
      var cached = r[cacheKey];
      if (cached && cached.expiry > Date.now()) {
        sendResponse({ ok: true, data: cached.data });
        return;
      }

      // 새 API 호출
      fetch(API_BASE + '/api/ext/keyword-analysis?keyword=' + encodeURIComponent(keyword))
        .then(function (r) { return r.json(); })
        .then(function (data) {
          if (data.error) {
            // 폴백: 기존 API
            return fallbackFetch(keyword);
          }
          // 캐시 저장
          var obj = {};
          obj[cacheKey] = { data: data, expiry: Date.now() + CACHE_TTL };
          chrome.storage.local.set(obj);
          sendResponse({ ok: true, data: data });
        })
        .catch(function () {
          // 폴백
          fallbackFetch(keyword).then(function (data) {
            sendResponse({ ok: true, data: data });
          }).catch(function (err) {
            sendResponse({ ok: false, error: err.message });
          });
        });
    });
    return true;
  }

  // 하위 호환: 기존 fetch-search-volume도 지원
  if (msg.type === 'fetch-search-volume') {
    fetch(API_BASE + '/api/search-volume?keyword=' + encodeURIComponent(msg.keyword))
      .then(function (r) { return r.json(); })
      .then(function (data) { sendResponse({ ok: true, data: data }); })
      .catch(function (err) { sendResponse({ ok: false, error: err.message }); });
    return true;
  }
});

// 기존 API로 폴백 (새 API 형식으로 변환)
function fallbackFetch(keyword) {
  return fetch(API_BASE + '/api/search-volume?keyword=' + encodeURIComponent(keyword))
    .then(function (r) { return r.json(); })
    .then(function (data) {
      if (!data.keywords || data.keywords.length === 0) throw new Error('No data');
      var main = data.keywords[0];
      var pc = parseInt(String(main.monthlyPc).replace(/[<,\s]/g, ''), 10) || 0;
      var mobile = parseInt(String(main.monthlyMobile).replace(/[<,\s]/g, ''), 10) || 0;

      var compLevel = main.competition || '낮음';
      var compScore = compLevel === '높음' ? 75 : compLevel === '중간' ? 45 : 20;

      return {
        keyword: main.keyword,
        volume: { total: pc + mobile, pc: pc, mobile: mobile },
        competition: { level: compLevel, score: compScore, participants: 0 },
        trend: { direction: 'stable', change: 0 },
        related: data.keywords.slice(1, 11).map(function (kw) {
          var kwPc = parseInt(String(kw.monthlyPc).replace(/[<,\s]/g, ''), 10) || 0;
          var kwMobile = parseInt(String(kw.monthlyMobile).replace(/[<,\s]/g, ''), 10) || 0;
          return { keyword: kw.keyword, total: kwPc + kwMobile, competition: kw.competition || '낮음' };
        })
      };
    });
}
