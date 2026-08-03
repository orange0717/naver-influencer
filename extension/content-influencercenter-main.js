// N인플 자동 동기화 — 인플루언서센터 페이지 내부 API 가로채기 (MAIN world)
// influencercenter.naver.com/my 페이지가 자체적으로 호출하는 내부 API 응답을
// 가로채서 window.postMessage로 격리된(isolated) content script에 전달한다.
// 정확한 API 도메인/경로를 몰라도, 응답 URL에 특정 키워드가 포함되는지만 보고 판단한다.

(() => {
  const TARGETS = ['mypage-owner-profile', 'mypage-category-rank', 'mypage-indicator-highlight'];
  const POST_SOURCE = 'ninfle-ext-capture';

  function matchTarget(url) {
    if (!url) return null;
    return TARGETS.find((t) => url.includes(t)) || null;
  }

  function emit(key, data) {
    try {
      window.postMessage({ source: POST_SOURCE, key, data }, '*');
    } catch {
      // no-op
    }
  }

  function handleText(url, text) {
    const key = matchTarget(url);
    if (!key || !text) return;
    try {
      emit(key, JSON.parse(text));
    } catch {
      // JSON 파싱 실패 시 무시 (스펙이 바뀌었을 가능성)
    }
  }

  // fetch 가로채기
  const origFetch = window.fetch;
  if (typeof origFetch === 'function') {
    window.fetch = function (...args) {
      const url = typeof args[0] === 'string' ? args[0] : args[0]?.url || '';
      return origFetch.apply(this, args).then((res) => {
        if (matchTarget(url)) {
          res
            .clone()
            .text()
            .then((text) => handleText(url, text))
            .catch(() => {});
        }
        return res;
      });
    };
  }

  // XMLHttpRequest 가로채기 (혹시 XHR로 호출하는 경로가 있을 경우 대비)
  const OrigXHR = window.XMLHttpRequest;
  if (OrigXHR) {
    function PatchedXHR() {
      const xhr = new OrigXHR();
      const origOpen = xhr.open;
      xhr.open = function (method, url, ...rest) {
        this.__ninfleUrl = url;
        return origOpen.call(this, method, url, ...rest);
      };
      xhr.addEventListener('load', function () {
        if (this.__ninfleUrl) handleText(this.__ninfleUrl, this.responseText);
      });
      return xhr;
    }
    PatchedXHR.prototype = OrigXHR.prototype;
    window.XMLHttpRequest = PatchedXHR;
  }
})();
