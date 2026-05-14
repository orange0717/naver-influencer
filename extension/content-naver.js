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
    const isMySpace = sp ? sp.isMySpace : undefined;
    return {
      spaceId,
      urlId,
      /** 네이버가 true 로 줄 때만 확실한 본인 공간 */
      isOwnSpace: isMySpace === true,
      /** 타인 프로필로 판정되는 경우 */
      isExplicitOther: isMySpace === false,
    };
  }

  /** 팔로워·팔로잉 urlId 기준 집합 분석 (맞팬 / 나만 팬 / 상대만 팬) */
  function analyzeFanRelations(followers, followings) {
    const followerIds = new Set(followers.map((x) => x.urlId).filter(Boolean));
    const followingIds = new Set(followings.map((x) => x.urlId).filter(Boolean));
    const mutual = followings.filter((x) => x.urlId && followerIds.has(x.urlId));
    const iFollowOnly = followings.filter((x) => x.urlId && !followerIds.has(x.urlId));
    const followsMeOnly = followers.filter((x) => x.urlId && !followingIds.has(x.urlId));
    return { mutual, iFollowOnly, followsMeOnly };
  }

  function showFanAnalysisPanel({ mutual, iFollowOnly, followsMeOnly }) {
    const wrapId = '__ninfle_fan_analysis__';
    let wrap = document.getElementById(wrapId);
    if (!wrap) {
      wrap = document.createElement('div');
      wrap.id = wrapId;
      wrap.style.cssText = [
        'position:fixed', 'bottom:20px', 'right:20px', 'z-index:2147483646',
        'max-width:min(360px,calc(100vw - 40px))', 'padding:14px 16px', 'border-radius:12px',
        'background:#fff', 'color:#333', 'box-shadow:0 8px 32px rgba(0,0,0,0.15)',
        'font:13px/1.45 -apple-system,system-ui,sans-serif', 'border:1px solid #e8e0dc',
      ].join(';');
      document.body.appendChild(wrap);
    }
    const copyJson = (label, arr) => {
      const t = JSON.stringify(arr, null, 2);
      navigator.clipboard.writeText(t).then(
        () => toast(`${label} 목록을 클립보드에 복사했습니다.`, 'success'),
        () => prompt('복사에 실패했습니다. 아래를 직접 복사하세요.', t),
      );
    };
    wrap.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;">
        <strong style="font-size:14px;">팬 관계 분석</strong>
        <button type="button" id="__ninfle_fan_close__" style="border:none;background:transparent;cursor:pointer;font-size:18px;line-height:1;color:#888;">×</button>
      </div>
      <ul style="margin:0 0 10px 18px;padding:0;">
        <li><strong>맞팬</strong> ${mutual.length}명</li>
        <li><strong>나만 팬</strong> ${iFollowOnly.length}명 <span style="color:#888;font-size:12px;">(내가 팬인데 상대는 나를 팬하지 않음)</span></li>
        <li><strong>상대만 팬</strong> ${followsMeOnly.length}명 <span style="color:#888;font-size:12px;">(나를 팬인데 내가 팬하지 않음)</span></li>
      </ul>
      <div style="display:flex;flex-wrap:wrap;gap:6px;">
        <button type="button" data-copy="mutual" class="__ninfle_fan_btn__" style="padding:6px 10px;border-radius:8px;border:1px solid #ccc;background:#fafafa;cursor:pointer;font-size:12px;">맞팬 복사</button>
        <button type="button" data-copy="iFollowOnly" class="__ninfle_fan_btn__" style="padding:6px 10px;border-radius:8px;border:1px solid #c45c4a;background:#fff5f3;cursor:pointer;font-size:12px;">나만 팬 복사</button>
        <button type="button" data-copy="followsMeOnly" class="__ninfle_fan_btn__" style="padding:6px 10px;border-radius:8px;border:1px solid #ccc;background:#fafafa;cursor:pointer;font-size:12px;">상대만 팬 복사</button>
      </div>
      <p style="margin:10px 0 0;font-size:11px;color:#888;">과거 맞팬이었다가 상대만 팬을 끊은 경우는, 현재 스냅샷에서는 「나만 팬」에 포함됩니다.</p>
    `;
    wrap.querySelector('#__ninfle_fan_close__').onclick = () => wrap.remove();
    wrap.querySelectorAll('[data-copy]').forEach((btn) => {
      btn.onclick = () => {
        const k = btn.getAttribute('data-copy');
        if (k === 'mutual') copyJson('맞팬', mutual);
        else if (k === 'iFollowOnly') copyJson('나만 팬', iFollowOnly);
        else if (k === 'followsMeOnly') copyJson('상대만 팬', followsMeOnly);
      };
    });
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

    const analysis = analyzeFanRelations(followers, followings);
    await chrome.storage.local.set({
      lastFanAnalysisAt: Date.now(),
      lastFanAnalysis: {
        mutual: analysis.mutual.length,
        iFollowOnly: analysis.iFollowOnly.length,
        followsMeOnly: analysis.followsMeOnly.length,
      },
    });
    if (!silent) {
      showFanAnalysisPanel(analysis);
      toast(
        `분석: 맞팬 ${analysis.mutual.length} · 나만 팬 ${analysis.iFollowOnly.length} · 상대만 팬 ${analysis.followsMeOnly.length}`,
        'info',
      );
    }

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
        await chrome.storage.local.set({
          lastSyncAt: Date.now(),
          lastSyncCounts: c,
          linkedOwnerUrlId: urlId,
        });
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
    const { spaceId, urlId, isOwnSpace, isExplicitOther } = getOwnerInfo();
    if (isExplicitOther) {
      console.log('[ninfle-ext] auto-sync skipped (other user space)', urlId);
      return;
    }
    if (!spaceId || !urlId) return;

    let allowAuto = isOwnSpace;
    if (!allowAuto) {
      const { linkedOwnerUrlId } = await chrome.storage.local.get('linkedOwnerUrlId');
      allowAuto = !!(linkedOwnerUrlId && linkedOwnerUrlId === urlId);
      if (!allowAuto) {
        console.log('[ninfle-ext] auto-sync skipped (not own / no linkedOwnerUrlId yet — use manual sync once)');
        return;
      }
    }

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
    await runSync({ silent: true });
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
