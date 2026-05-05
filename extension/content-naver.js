// N인플 자동 동기화 — Naver content script
// 사용자가 본인 인플루언서 홈(in.naver.com/[urlId])에 진입하면
// 자동으로 팔로워/팔로잉 데이터를 추출해 background로 보낸다.

(() => {
  const AUTO_SYNC_COOLDOWN_MS = 30 * 60 * 1000; // 30분 내 재동기화 방지

  function getOwnerInfo() {
    const state = window.__PRELOADED_STATE__;
    const sp = state && state.space && state.space.data ? state.space.data : null;
    const spaceId = sp && sp.id;
    const urlId = (sp && sp.urlId) || (location.pathname.split('/').filter(Boolean)[0] || null);
    const isOwnSpace = sp && sp.isMySpace === true;
    return { spaceId, urlId, isOwnSpace };
  }

  function pick(...args) {
    for (const a of args) if (a !== undefined && a !== null && a !== '') return a;
    return undefined;
  }

  function normalize(rawList) {
    const out = [];
    for (const raw of rawList) {
      const r = raw || {};
      const space = r.space || r;
      const profile = (space && space.profile) || r.profile || {};
      const myKeyword = (space && space.myKeyword) || r.myKeyword || {};
      const item = {
        urlId: pick(space.urlId, r.urlId),
        spaceId: pick(space.id, r.spaceId, r.id) || null,
        ownerId: pick(space.ownerId, r.ownerId) || null,
        nickname: pick(profile.nickName, r.nickName, r.nickname) || '',
        imageUrl: pick(profile.profileImageUrl, r.profileImageUrl, r.imageUrl) || '',
        category: pick(myKeyword.keyword, r.keyword, r.category) || '',
        followerCount: pick(profile.followerCount, r.followerCount) || 0,
      };
      if (item.urlId) out.push(item);
    }
    return out;
  }

  async function fetchAll(spaceId, type) {
    const items = [];
    let cursor = null;
    const isFollowers = type === 'followers';
    const path = isFollowers
      ? `/home/api/v2/spaces/${spaceId}/subscribes/followers`
      : `/home/api/v2/spaces/${spaceId}/subscribes/following`;
    for (let safety = 0; safety < 200; safety++) {
      const url = new URL('https://gw.in.naver.com' + path);
      url.searchParams.set('limit', '100');
      url.searchParams.set('sort', 'RECENT');
      if (isFollowers) url.searchParams.set('subscriberType', 'SPACE');
      if (cursor) url.searchParams.set('cursor', cursor);
      const res = await fetch(url.toString(), {
        credentials: 'include',
        headers: { 'X-Api-Level': '11', Accept: 'application/json, text/plain, */*' },
      });
      if (!res.ok) throw new Error(`${type} HTTP ${res.status}`);
      const json = await res.json();
      const batch = [].concat(json.influencerItems || [], json.naverItems || [], json.items || []);
      for (const b of batch) items.push(b);
      const paging = json.paging || {};
      const next = paging.next || paging.cursor || paging.nextCursor || null;
      const hasMore = paging.hasMore;
      if (!next || hasMore === false || batch.length === 0) break;
      cursor = next;
    }
    return items;
  }

  async function runSync({ silent }) {
    const { spaceId, urlId } = getOwnerInfo();
    if (!spaceId || !urlId) {
      if (!silent) toast('이 페이지에서는 동기화할 수 없습니다. 본인 인플루언서 홈으로 이동하세요.', 'error');
      return { ok: false, reason: 'no-owner' };
    }

    if (!silent) toast('동기화 중...', 'info');

    let followers, followings;
    try {
      const [rawF, rawG] = await Promise.all([
        fetchAll(spaceId, 'followers'),
        fetchAll(spaceId, 'following'),
      ]);
      followers = normalize(rawF);
      followings = normalize(rawG);
    } catch (e) {
      console.error('[ninfle-ext] scrape failed:', e);
      toast('동기화 실패: ' + (e?.message || e), 'error');
      return { ok: false, reason: 'scrape-failed', error: String(e) };
    }

    const payload = {
      source: 'extension',
      ownerUrlId: urlId,
      ownerSpaceId: spaceId,
      followers,
      followings,
    };

    try {
      const result = await chrome.runtime.sendMessage({ type: 'UPLOAD_FANS', payload });
      if (result?.ok) {
        const c = result.counts || {};
        toast(
          `동기화 완료 — 팬 ${c.followers ?? followers.length} / 팔로잉 ${c.followings ?? followings.length}` +
            (c.added ? ` (+${c.added})` : '') +
            (c.removed ? ` (-${c.removed})` : ''),
          'success',
        );
        await chrome.storage.local.set({ lastSyncAt: Date.now(), lastSyncCounts: c });
      } else if (result?.error === 'NOT_AUTHENTICATED') {
        toast('N인플 로그인이 필요합니다. ninfle.kr 에 로그인 후 다시 시도하세요.', 'error');
      } else {
        toast('업로드 실패: ' + (result?.error || 'unknown'), 'error');
      }
      return result;
    } catch (e) {
      console.error('[ninfle-ext] upload failed:', e);
      toast('업로드 실패: ' + (e?.message || e), 'error');
      return { ok: false, reason: 'upload-failed' };
    }
  }

  // 인페이지 토스트 (간단)
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

  async function maybeAutoSync() {
    const { isOwnSpace, urlId } = getOwnerInfo();
    if (!isOwnSpace) return; // 본인 페이지가 아니면 자동 실행 안 함

    const { autoSyncEnabled = true, lastAutoSyncAt = 0 } = await chrome.storage.local.get([
      'autoSyncEnabled', 'lastAutoSyncAt',
    ]);
    if (!autoSyncEnabled) return;
    if (Date.now() - lastAutoSyncAt < AUTO_SYNC_COOLDOWN_MS) {
      console.log('[ninfle-ext] auto-sync skipped (cooldown)');
      return;
    }

    // 인증 토큰이 저장돼 있는 경우에만 시도
    const { ninfleToken } = await chrome.storage.local.get('ninfleToken');
    if (!ninfleToken) {
      console.log('[ninfle-ext] auto-sync skipped (no token, visit ninfle.kr first)');
      return;
    }

    console.log('[ninfle-ext] auto-syncing for', urlId);
    await chrome.storage.local.set({ lastAutoSyncAt: Date.now() });
    await runSync({ silent: false });
  }

  // popup → content 메시지 (수동 동기화)
  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (msg?.type === 'TRIGGER_SYNC') {
      runSync({ silent: false }).then(sendResponse);
      return true;
    }
    if (msg?.type === 'PING_OWNER_INFO') {
      sendResponse(getOwnerInfo());
      return false;
    }
  });

  // 페이지 로드 시 자동 시도 (PRELOADED_STATE가 채워질 시간을 잠깐 기다림)
  setTimeout(maybeAutoSync, 1500);
})();
