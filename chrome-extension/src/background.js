/* ══════════════════════════════════════════════════════
   N인플 키워드 분석 — Service Worker
   컨텍스트 메뉴 → Side Panel + API 프록시
   ══════════════════════════════════════════════════════ */

const API_BASE = 'https://naver-influencer.vercel.app';

/* ══════════════════════════════════════
   컨텍스트 메뉴 + Side Panel
   ══════════════════════════════════════ */
chrome.runtime.onInstalled.addListener(function () {
  chrome.contextMenus.create({
    id: 'ninfl-analyze',
    title: 'N인플 분석',
    contexts: ['page', 'selection']
  });
});

chrome.contextMenus.onClicked.addListener(async function (info, tab) {
  if (info.menuItemId === 'ninfl-analyze') {
    var data = {
      selectedText: info.selectionText ? info.selectionText.trim() : '',
      pageUrl: tab.url || '',
      pageTitle: tab.title || '',
      timestamp: Date.now()
    };

    await chrome.storage.local.set({ ninflContext: data });

    try {
      await chrome.sidePanel.open({ tabId: tab.id });
    } catch (e) {
      // Side Panel 미지원 시 무시
    }
  }
});

/* ══════════════════════════════════════
   API 프록시 — Side Panel → background → API
   ══════════════════════════════════════ */
chrome.runtime.onMessage.addListener(function (msg, sender, sendResponse) {

  /* 키워드 검색량 */
  if (msg.type === 'fetch-search-volume') {
    fetchAPI('/api/search-volume?keyword=' + encodeURIComponent(msg.keyword))
      .then(function (data) { sendResponse({ data: data }); })
      .catch(function (e) { sendResponse({ error: e.message }); });
    return true;
  }

  /* 블로그 키워드 목록 */
  if (msg.type === 'fetch-blog-keywords') {
    fetchAPI('/api/blog/keywords?blogId=' + encodeURIComponent(msg.blogId))
      .then(function (data) { sendResponse({ data: data }); })
      .catch(function (e) { sendResponse({ error: e.message }); });
    return true;
  }

  /* 블로그 순위 확인 */
  if (msg.type === 'fetch-blog-rank') {
    var url = '/api/blog/rank?blogId=' + encodeURIComponent(msg.blogId)
      + '&keyword=' + encodeURIComponent(msg.keyword);
    fetchAPI(url)
      .then(function (data) { sendResponse({ data: data }); })
      .catch(function (e) { sendResponse({ error: e.message }); });
    return true;
  }

  /* 노출/누락 확인 */
  if (msg.type === 'fetch-blog-check-missing') {
    fetchAPI('/api/blog/check-missing?blogId=' + encodeURIComponent(msg.blogId))
      .then(function (data) { sendResponse({ data: data }); })
      .catch(function (e) { sendResponse({ error: e.message }); });
    return true;
  }

  /* 키워드 TOP 순위 */
  if (msg.type === 'fetch-blog-top') {
    var url = '/api/keywords/blog-top?keyword=' + encodeURIComponent(msg.keyword)
      + '&tab=' + (msg.tab || 'blog');
    fetchAPI(url)
      .then(function (data) { sendResponse({ data: data }); })
      .catch(function (e) { sendResponse({ error: e.message }); });
    return true;
  }

  /* content script → storage (페이지 데이터 전달) */
  if (msg.type === 'page-data') {
    chrome.storage.local.set({ ninflPageData: msg.data });
    sendResponse({ ok: true });
    return false;
  }
});

/* ── API fetch 헬퍼 ── */
async function fetchAPI(endpoint) {
  var res = await fetch(API_BASE + endpoint);
  if (!res.ok) {
    var detail = '';
    try { var obj = await res.json(); detail = obj.error || ''; } catch (_) {}
    throw new Error(detail || 'API 오류 (' + res.status + ')');
  }
  return res.json();
}
