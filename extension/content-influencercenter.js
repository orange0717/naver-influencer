// N인플 자동 동기화 — 인플루언서센터 content script (ISOLATED world)
// content-influencercenter-main.js(MAIN world)가 postMessage로 보내주는
// 캡처된 API 응답들을 모아서 ninfle.kr로 업로드한다.

(() => {
  const AUTO_SYNC_COOLDOWN_MS = 30 * 60 * 1000; // 30분 내 재동기화 방지
  const collected = {};
  let uploadTimer = null;

  function toast(msg, kind = 'info') {
    const id = '__ninfle_ext_toast__';
    let el = document.getElementById(id);
    if (!el) {
      el = document.createElement('div');
      el.id = id;
      el.style.cssText = [
        'position:fixed', 'top:16px', 'right:16px', 'z-index:2147483647',
        'padding:12px 16px', 'border-radius:10px', 'font:14px/1.4 -apple-system,system-ui,sans-serif',
        'box-shadow:0 8px 24px rgba(0,0,0,0.18)', 'max-width:340px', 'color:#fff',
        'transition:opacity .25s', 'opacity:0',
      ].join(';');
      document.body.appendChild(el);
    }
    const colors = { info: '#BF877A', success: '#2E8B57', error: '#D94848' };
    el.style.background = colors[kind] || colors.info;
    el.textContent = '[N인플] ' + msg;
    requestAnimationFrame(() => { el.style.opacity = '1'; });
    clearTimeout(el._timer);
    el._timer = setTimeout(() => { el.style.opacity = '0'; }, 4500);
  }

  window.addEventListener('message', (event) => {
    if (event.source !== window) return;
    const msg = event.data;
    if (!msg || msg.source !== 'ninfle-ext-capture' || !msg.key) return;
    collected[msg.key] = msg.data;
    scheduleUpload();
  });

  function scheduleUpload() {
    clearTimeout(uploadTimer);
    // 세 응답이 거의 동시에 도착하므로 잠깐 기다렸다가 한 번에 처리
    uploadTimer = setTimeout(tryUpload, 1000);
  }

  async function tryUpload() {
    const profile = collected['mypage-owner-profile'];
    const rank = collected['mypage-category-rank'];
    const highlight = collected['mypage-indicator-highlight'];
    if (!profile || !rank || !highlight) return; // 아직 다 안 모임 (페이지 재방문 시 다시 시도됨)

    const { ninfleToken } = await chrome.storage.local.get('ninfleToken');
    if (!ninfleToken) {
      console.log('[ninfle-ext] center sync skipped (no token, visit ninfle.kr first)');
      return;
    }

    const { lastCenterSyncAt = 0 } = await chrome.storage.local.get('lastCenterSyncAt');
    if (Date.now() - lastCenterSyncAt < AUTO_SYNC_COOLDOWN_MS) return;

    const ownerUrlId = (profile.spaceUrl || '').split('/').filter(Boolean).pop() || null;

    const payload = {
      source: 'extension',
      ownerUrlId,
      myCategoryId: profile.myCategoryId ?? null,
      myCategoryName: profile.myCategoryName || null,
      categoryRanking: rank.categoryRanking ?? null,
      categoryInfluencerCount: rank.categoryInfluencerCount ?? null,
      revenue: highlight.revenue ?? null,
      revenueChange: highlight.revenueIncrOrDecr ?? null,
      viewCount: highlight.viewCount ?? null,
      viewCountChange: highlight.viewCountIncrOrDecr ?? null,
      infViewCountChange: highlight.infViewCountIncrOrDecr ?? null,
      searchDate: highlight.searchDate || null,
    };

    await chrome.storage.local.set({ lastCenterSyncAt: Date.now() });

    try {
      const result = await chrome.runtime.sendMessage({ type: 'UPLOAD_CENTER_STATS', payload });
      if (result?.ok) {
        toast(
          `순위 동기화 완료 — ${payload.myCategoryName || '전체'} ${payload.categoryRanking ?? '?'}위`,
          'success',
        );
      } else if (result?.error === 'NOT_AUTHENTICATED') {
        console.log('[ninfle-ext] center sync skipped (ninfle.kr 로그인 필요)');
      } else {
        console.warn('[ninfle-ext] center upload failed:', result?.error);
      }
    } catch (e) {
      console.error('[ninfle-ext] center upload failed:', e);
    }
  }
})();
