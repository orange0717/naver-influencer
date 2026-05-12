'use strict';

const {
  app,
  BrowserWindow,
  Menu,
  Tray,
  Notification,
  ipcMain,
  shell,
  nativeImage,
  globalShortcut,
  session,
} = require('electron');
const path = require('node:path');

const APP_URL = process.env.NINFL_URL || 'https://ninfle.kr';
const APP_NAME = 'N인플';
const isMac = process.platform === 'darwin';
const isWin = process.platform === 'win32';

let mainWindow = null;
let tray = null;
let isQuitting = false;

if (!app.requestSingleInstanceLock()) {
  app.quit();
  process.exit(0);
}

app.on('second-instance', () => {
  if (mainWindow) {
    if (mainWindow.isMinimized()) mainWindow.restore();
    if (!mainWindow.isVisible()) mainWindow.show();
    mainWindow.focus();
  }
});

function resolveIcon() {
  const file = isWin ? 'icon.ico' : isMac ? 'icon.icns' : 'icon.png';
  return path.join(__dirname, 'icons', file);
}

function createMainWindow() {
  const iconPath = resolveIcon();
  const icon = nativeImage.createFromPath(iconPath);

  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1024,
    minHeight: 680,
    title: APP_NAME,
    backgroundColor: '#FAF7F5',
    show: false,
    icon: icon.isEmpty() ? undefined : icon,
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      devTools: false,
      spellcheck: false,
      webSecurity: true,
    },
  });

  mainWindow.removeMenu();
  mainWindow.setMenu(null);

  mainWindow.loadURL(APP_URL);

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });

  // 외부 링크는 시스템 기본 브라우저로
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (isSafeExternalUrl(url)) shell.openExternal(url);
    return { action: 'deny' };
  });

  // ninfle.kr 외부 도메인 이동 차단(외부는 브라우저로)
  mainWindow.webContents.on('will-navigate', (event, navUrl) => {
    if (!isSameOrigin(navUrl, APP_URL)) {
      event.preventDefault();
      if (isSafeExternalUrl(navUrl)) shell.openExternal(navUrl);
    }
  });

  // 우클릭 메뉴 비활성화
  mainWindow.webContents.on('context-menu', (e) => e.preventDefault());

  // 닫기 시 종료하지 않고 트레이로
  mainWindow.on('close', (event) => {
    if (!isQuitting) {
      event.preventDefault();
      mainWindow.hide();
      if (isMac) app.dock?.hide?.();
    }
  });

  mainWindow.on('show', () => {
    if (isMac) app.dock?.show?.();
  });

  // 페이지가 Electron 환경임을 알 수 있도록 사용자 에이전트 표시 추가
  mainWindow.webContents.setUserAgent(
    mainWindow.webContents.getUserAgent() + ' NinflDesktop/' + app.getVersion()
  );
}

function isSameOrigin(target, base) {
  try {
    const t = new URL(target);
    const b = new URL(base);
    return t.origin === b.origin;
  } catch (_) {
    return false;
  }
}

function isSafeExternalUrl(url) {
  try {
    const u = new URL(url);
    return u.protocol === 'https:' || u.protocol === 'http:' || u.protocol === 'mailto:';
  } catch (_) {
    return false;
  }
}

function createTray() {
  const iconPath = path.join(__dirname, 'icons', isMac ? 'tray-Template.png' : 'tray.png');
  const trayIcon = nativeImage.createFromPath(iconPath);

  tray = new Tray(trayIcon.isEmpty() ? nativeImage.createEmpty() : trayIcon);
  tray.setToolTip(APP_NAME);

  const contextMenu = Menu.buildFromTemplate([
    {
      label: `${APP_NAME} 열기`,
      click: showMainWindow,
    },
    { type: 'separator' },
    {
      label: '대시보드',
      click: () => loadAndShow(`${APP_URL}/my`),
    },
    {
      label: '키워드 분석',
      click: () => loadAndShow(`${APP_URL}/keywords`),
    },
    {
      label: '구독 관리',
      click: () => loadAndShow(`${APP_URL}/subscribe`),
    },
    { type: 'separator' },
    {
      label: '테스트 알림 보내기',
      click: () => sendNotification({ title: 'N인플', body: '알림이 정상 동작합니다.' }),
    },
    { type: 'separator' },
    {
      label: '버전 ' + app.getVersion(),
      enabled: false,
    },
    {
      label: '종료',
      click: () => {
        isQuitting = true;
        app.quit();
      },
    },
  ]);

  tray.setContextMenu(contextMenu);
  tray.on('click', () => {
    if (!isMac) showMainWindow();
  });
  tray.on('double-click', showMainWindow);
}

function showMainWindow() {
  if (!mainWindow) return;
  if (!mainWindow.isVisible()) mainWindow.show();
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.focus();
}

function loadAndShow(url) {
  if (!mainWindow) return;
  if (isSameOrigin(url, APP_URL)) mainWindow.loadURL(url);
  showMainWindow();
}

function sendNotification({ title, body, silent, urgent } = {}) {
  if (!Notification.isSupported()) return false;
  const n = new Notification({
    title: title || APP_NAME,
    body: body || '',
    silent: !!silent,
    urgency: urgent ? 'critical' : 'normal',
    icon: resolveIcon(),
  });
  n.on('click', showMainWindow);
  n.show();
  return true;
}

ipcMain.handle('ninfl:notify', (_evt, payload) => {
  return sendNotification(payload || {});
});

ipcMain.handle('ninfl:open-external', (_evt, url) => {
  if (typeof url === 'string' && isSafeExternalUrl(url)) {
    return shell.openExternal(url);
  }
  return false;
});

ipcMain.handle('ninfl:get-version', () => app.getVersion());

ipcMain.handle('ninfl:set-badge', (_evt, count) => {
  const n = Number(count) || 0;
  if (isMac) app.dock?.setBadge?.(n > 0 ? String(n) : '');
  if (isWin) mainWindow?.setOverlayIcon(null, n > 0 ? `${n}개의 알림` : '');
  return true;
});

app.whenReady().then(() => {
  // 키워드 단축키(DevTools 등) 전역 차단
  const blockedShortcuts = isMac
    ? ['Command+Alt+I', 'Command+Alt+J', 'Command+Alt+C', 'Command+Alt+U']
    : ['Control+Shift+I', 'Control+Shift+J', 'Control+Shift+C', 'Control+U', 'F12'];

  for (const accel of blockedShortcuts) {
    try {
      globalShortcut.register(accel, () => {});
    } catch (_) {}
  }

  // 권한 요청은 알림/클립보드 외 전부 거부
  session.defaultSession.setPermissionRequestHandler((_wc, permission, callback) => {
    if (permission === 'notifications' || permission === 'clipboard-read') return callback(true);
    return callback(false);
  });

  // 메뉴바: macOS 최소 메뉴(편집 단축키만 유지), 기타 OS는 메뉴 없음
  if (isMac) {
    Menu.setApplicationMenu(buildMacMenu());
  } else {
    Menu.setApplicationMenu(null);
  }

  createMainWindow();
  createTray();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createMainWindow();
    else showMainWindow();
  });
});

function buildMacMenu() {
  return Menu.buildFromTemplate([
    {
      label: APP_NAME,
      submenu: [
        { label: `${APP_NAME} 정보`, role: 'about' },
        { type: 'separator' },
        { label: '숨기기', role: 'hide' },
        { label: '다른 항목 숨기기', role: 'hideOthers' },
        { label: '모두 보이기', role: 'unhide' },
        { type: 'separator' },
        {
          label: '종료',
          accelerator: 'Command+Q',
          click: () => {
            isQuitting = true;
            app.quit();
          },
        },
      ],
    },
    {
      label: '편집',
      submenu: [
        { label: '실행 취소', role: 'undo' },
        { label: '다시 실행', role: 'redo' },
        { type: 'separator' },
        { label: '잘라내기', role: 'cut' },
        { label: '복사', role: 'copy' },
        { label: '붙여넣기', role: 'paste' },
        { label: '모두 선택', role: 'selectAll' },
      ],
    },
    {
      label: '창',
      submenu: [
        { label: '최소화', role: 'minimize' },
        { label: '최대화 전환', role: 'togglefullscreen' },
        { type: 'separator' },
        { label: '앞으로 모두 가져오기', role: 'front' },
      ],
    },
  ]);
}

app.on('before-quit', () => {
  isQuitting = true;
});

app.on('will-quit', () => {
  globalShortcut.unregisterAll();
});

app.on('window-all-closed', () => {
  // 트레이가 살아 있으므로 종료하지 않음 (사용자가 명시적으로 종료해야 함)
});
