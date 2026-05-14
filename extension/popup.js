// N인플 동기화 — popup logic

const $ = (id) => document.getElementById(id);

function fmtTime(ts) {
  if (!ts) return '없음';
  const d = new Date(ts);
  const now = Date.now();
  const diff = (now - ts) / 1000;
  if (diff < 60) return '방금 전';
  if (diff < 3600) return `${Math.floor(diff / 60)}분 전`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}시간 전`;
  return d.toLocaleString('ko-KR', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

async function refreshAuth() {
  const status = await chrome.runtime.sendMessage({ type: 'GET_AUTH_STATUS' });
  const authStatus = $('auth-status');
  const emailRow = $('email-row');
  const emailEl = $('auth-email');
  const actions = $('auth-actions');
  const syncBtn = $('sync-now');
  const help = $('sync-help');

  if (status?.authenticated) {
    authStatus.textContent = '연결됨';
    authStatus.className = 'value status-ok';
    if (status.email) {
      emailEl.textContent = status.email;
      emailRow.hidden = false;
    }
    actions.innerHTML = '<button id="logout" class="btn">연결 해제</button>';
    $('logout').addEventListener('click', async () => {
      await chrome.runtime.sendMessage({ type: 'CLEAR_AUTH' });
      refreshAuth();
    });
    syncBtn.disabled = false;
    help.textContent = '';
  } else {
    authStatus.textContent = '연결 안 됨';
    authStatus.className = 'value status-warn';
    emailRow.hidden = true;
    actions.innerHTML =
      '<a id="open-ninfle" class="btn primary" href="https://ninfle.kr/auth/login" target="_blank">ninfle.kr 로그인</a>';
    syncBtn.disabled = true;
    help.textContent = 'ninfle.kr 에 로그인 후 다시 시도하세요.';
  }
}

async function refreshLastSync() {
  const { lastSyncAt, lastSyncCounts } = await chrome.storage.local.get(['lastSyncAt', 'lastSyncCounts']);
  const el = $('last-sync');
  if (lastSyncAt) {
    const c = lastSyncCounts || {};
    const counts =
      c.followers !== undefined
        ? ` (팬 ${c.followers} / 팔로잉 ${c.followings ?? 0})`
        : '';
    el.textContent = fmtTime(lastSyncAt) + counts;
    el.classList.remove('muted');
  } else {
    el.textContent = '없음';
    el.classList.add('muted');
  }
}

async function refreshPageStatus() {
  const tab = (await chrome.tabs.query({ active: true, currentWindow: true }))[0];
  const el = $('page-status');
  const help = $('sync-help');
  if (!tab?.url || !tab.url.startsWith('https://in.naver.com/')) {
    el.textContent = 'in.naver.com 아님';
    el.className = 'value muted';
    if (!help.textContent) help.textContent = '본인 인플루언서 홈(in.naver.com/[내 ID])을 열어주세요.';
    $('sync-now').disabled = true;
    return;
  }

  try {
    const info = await chrome.tabs.sendMessage(tab.id, { type: 'PING_OWNER_INFO' });
    if (info?.spaceId && info?.urlId) {
      el.textContent = `@${info.urlId}` + (info.isExplicitOther ? ' (본인 페이지 아님)' : '');
      el.className = info.isExplicitOther ? 'value status-warn' : 'value status-ok';
      if (info.isExplicitOther) {
        help.textContent = '본인 계정이 아닌 페이지입니다. 본인 홈으로 이동하세요.';
      }
    } else {
      el.textContent = '페이지 로딩 대기';
      el.className = 'value muted';
    }
  } catch {
    el.textContent = 'in.naver.com (스크립트 미로드)';
    el.className = 'value muted';
  }
}

async function refreshAutoSync() {
  const { autoSyncEnabled = true } = await chrome.storage.local.get('autoSyncEnabled');
  $('auto-sync').checked = autoSyncEnabled;
}

$('auto-sync').addEventListener('change', async (e) => {
  await chrome.storage.local.set({ autoSyncEnabled: e.target.checked });
});

$('sync-now').addEventListener('click', async () => {
  const tab = (await chrome.tabs.query({ active: true, currentWindow: true }))[0];
  if (!tab?.url || !tab.url.startsWith('https://in.naver.com/')) {
    alert('네이버 인플루언서 본인 홈(in.naver.com/[내 ID])에서 실행해 주세요.');
    return;
  }
  $('sync-now').disabled = true;
  $('sync-now').textContent = '동기화 중...';
  try {
    await chrome.tabs.sendMessage(tab.id, { type: 'TRIGGER_SYNC' });
  } catch (e) {
    alert('동기화 실패: ' + (e?.message || e));
  } finally {
    setTimeout(() => {
      $('sync-now').disabled = false;
      $('sync-now').textContent = '지금 동기화';
      refreshLastSync();
    }, 1000);
  }
});

(async function init() {
  await refreshAuth();
  await Promise.all([refreshLastSync(), refreshPageStatus(), refreshAutoSync()]);
})();
