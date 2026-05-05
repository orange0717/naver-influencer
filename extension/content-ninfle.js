// N인플 자동 동기화 — ninfle.kr content script
// 사용자가 ninfle.kr에 로그인되어 있으면 Supabase 세션 토큰을 읽어 chrome.storage에 저장한다.
// 이렇게 하면 사용자가 별도로 토큰을 입력하지 않아도 확장 프로그램이 인증할 수 있다.

(() => {
  function findSupabaseSession() {
    // Supabase v2 는 localStorage에 sb-<project-ref>-auth-token 키로 저장
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (!k) continue;
        if (k.startsWith('sb-') && k.endsWith('-auth-token')) {
          const raw = localStorage.getItem(k);
          if (!raw) continue;
          try {
            const parsed = JSON.parse(raw);
            if (parsed?.access_token) {
              return {
                access_token: parsed.access_token,
                refresh_token: parsed.refresh_token,
                expires_at: parsed.expires_at, // unix seconds
                user_email: parsed.user?.email || null,
              };
            }
          } catch {
            // ignore parse error
          }
        }
      }
    } catch (e) {
      console.warn('[ninfle-ext] localStorage access failed:', e);
    }
    return null;
  }

  async function syncTokenToExtension() {
    const session = findSupabaseSession();
    if (!session) {
      console.log('[ninfle-ext] no Supabase session on this page');
      return;
    }
    await chrome.storage.local.set({
      ninfleToken: session.access_token,
      ninfleRefreshToken: session.refresh_token,
      ninfleTokenExpiresAt: session.expires_at,
      ninfleUserEmail: session.user_email,
      ninfleOrigin: location.origin,
      ninfleTokenSavedAt: Date.now(),
    });
    console.log('[ninfle-ext] token saved for', session.user_email || '(unknown)');

    // 페이지에 작은 인디케이터 한 번 띄움 (방해 안 되는 수준)
    showOnce();
  }

  function showOnce() {
    const id = '__ninfle_ext_connected__';
    if (document.getElementById(id) || sessionStorage.getItem(id)) return;
    sessionStorage.setItem(id, '1');
    const el = document.createElement('div');
    el.id = id;
    el.textContent = '✓ N인플 확장 프로그램 연결됨';
    el.style.cssText = [
      'position:fixed', 'bottom:16px', 'left:16px', 'z-index:2147483647',
      'padding:8px 12px', 'border-radius:8px', 'background:#2E8B57', 'color:#fff',
      'font:13px/1.4 -apple-system,system-ui,sans-serif', 'box-shadow:0 4px 12px rgba(0,0,0,0.18)',
      'opacity:0', 'transition:opacity .25s',
    ].join(';');
    document.body.appendChild(el);
    requestAnimationFrame(() => { el.style.opacity = '1'; });
    setTimeout(() => { el.style.opacity = '0'; setTimeout(() => el.remove(), 300); }, 2500);
  }

  // 초기 1회 + storage 이벤트 발생 시 (로그인 직후)
  syncTokenToExtension();
  window.addEventListener('storage', syncTokenToExtension);

  // SPA 라우트 변경 후에도 한 번 더 시도
  setTimeout(syncTokenToExtension, 2000);
})();
