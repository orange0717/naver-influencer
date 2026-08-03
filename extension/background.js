// N인플 자동 동기화 — Background service worker
// content script 로부터 받은 페이로드를 ninfle.kr API 로 업로드한다.

const DEFAULT_API_BASE = 'https://ninfle.kr';

async function getApiBase() {
  const { ninfleOrigin } = await chrome.storage.local.get('ninfleOrigin');
  return ninfleOrigin || DEFAULT_API_BASE;
}

async function uploadFans(payload) {
  const { ninfleToken } = await chrome.storage.local.get('ninfleToken');
  if (!ninfleToken) {
    return { ok: false, error: 'NOT_AUTHENTICATED' };
  }

  const base = await getApiBase();
  const res = await fetch(`${base}/api/my/fans/upload`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${ninfleToken}`,
      'X-Ninfle-Source': 'extension',
    },
    body: JSON.stringify(payload),
  });

  let json;
  try {
    json = await res.json();
  } catch {
    return { ok: false, error: `HTTP ${res.status}` };
  }

  if (!res.ok) {
    if (res.status === 401) return { ok: false, error: 'NOT_AUTHENTICATED' };
    return { ok: false, error: json?.error || `HTTP ${res.status}` };
  }
  return json;
}

async function uploadCenterStats(payload) {
  const { ninfleToken } = await chrome.storage.local.get('ninfleToken');
  if (!ninfleToken) {
    return { ok: false, error: 'NOT_AUTHENTICATED' };
  }

  const base = await getApiBase();
  const res = await fetch(`${base}/api/my/influencer-center/upload`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${ninfleToken}`,
      'X-Ninfle-Source': 'extension',
    },
    body: JSON.stringify(payload),
  });

  let json;
  try {
    json = await res.json();
  } catch {
    return { ok: false, error: `HTTP ${res.status}` };
  }

  if (!res.ok) {
    if (res.status === 401) return { ok: false, error: 'NOT_AUTHENTICATED' };
    return { ok: false, error: json?.error || `HTTP ${res.status}` };
  }
  return json;
}

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg?.type === 'UPLOAD_FANS' && msg.payload) {
    uploadFans(msg.payload)
      .then(sendResponse)
      .catch((e) => sendResponse({ ok: false, error: e?.message || String(e) }));
    return true; // async response
  }
  if (msg?.type === 'UPLOAD_CENTER_STATS' && msg.payload) {
    uploadCenterStats(msg.payload)
      .then(sendResponse)
      .catch((e) => sendResponse({ ok: false, error: e?.message || String(e) }));
    return true; // async response
  }
  if (msg?.type === 'GET_AUTH_STATUS') {
    chrome.storage.local
      .get(['ninfleToken', 'ninfleUserEmail', 'ninfleTokenExpiresAt', 'ninfleTokenSavedAt'])
      .then((v) => {
        const expired = v.ninfleTokenExpiresAt
          ? Date.now() / 1000 > v.ninfleTokenExpiresAt
          : false;
        sendResponse({
          authenticated: !!v.ninfleToken && !expired,
          email: v.ninfleUserEmail || null,
          savedAt: v.ninfleTokenSavedAt || null,
          expired,
        });
      });
    return true;
  }
  if (msg?.type === 'CLEAR_AUTH') {
    chrome.storage.local
      .remove(['ninfleToken', 'ninfleRefreshToken', 'ninfleTokenExpiresAt', 'ninfleUserEmail'])
      .then(() => sendResponse({ ok: true }));
    return true;
  }
});

chrome.runtime.onInstalled.addListener(() => {
  console.log('[ninfle-ext] installed');
});
