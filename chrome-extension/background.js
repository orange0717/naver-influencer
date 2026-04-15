// N인플 키워드 분석 - Background Service Worker
const API_BASE = 'https://naver-influencer.vercel.app';

chrome.runtime.onMessage.addListener(function (msg, sender, sendResponse) {
  if (msg.type === 'fetch-search-volume') {
    fetch(API_BASE + '/api/search-volume?keyword=' + encodeURIComponent(msg.keyword))
      .then(function (r) { return r.json(); })
      .then(function (data) { sendResponse({ ok: true, data: data }); })
      .catch(function (err) { sendResponse({ ok: false, error: err.message }); });
    return true; // async
  }
});
