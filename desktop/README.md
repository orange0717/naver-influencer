# N인플 데스크탑 앱

`https://ninfle.kr`을 감싸는 Electron 데스크탑 앱입니다.

## 특징

- macOS / Windows / Linux 지원
- 트레이 상주 — 창을 닫아도 백그라운드에서 알림 수신 가능
- 네이티브 OS 알림 (`window.ninfl.notify`)
- DevTools 및 우클릭 검사 완전 차단 (일반 사용자 노출 방지)
- 외부 링크는 시스템 기본 브라우저로 열기 (앱 내부는 ninfle.kr 도메인만)
- 단일 인스턴스 (중복 실행 방지)
- macOS Dock 배지 / Windows 오버레이 아이콘 지원

## 개발/실행

```bash
# 1) 의존성 설치
npm run desktop:install        # 루트에서 실행
# 또는: cd desktop && npm install

# 2) 개발 실행
npm run desktop:dev
# 기본은 https://ninfle.kr 을 로드합니다.
# 로컬 개발 서버를 가리키려면 환경변수로 오버라이드:
#   NINFL_URL=http://localhost:3000 npm run desktop:dev
```

## 빌드 (배포용 패키지)

```bash
# 현재 OS용
npm run desktop:build

# 플랫폼별
npm run desktop:build:mac      # .dmg + .zip (Intel + Apple Silicon)
npm run desktop:build:win      # .exe NSIS 인스톨러 + portable
npm run desktop:build:linux    # .AppImage + .deb
```

산출물 경로: `desktop/dist/`

## 아이콘 준비

`desktop/icons/icon.png` (512×512 또는 1024×1024)이 기본입니다.
배포 빌드 전에 OS별 형식이 필요합니다.

### macOS — `.icns` 만들기

```bash
cd desktop/icons
mkdir icon.iconset
sips -z 16 16     icon.png --out icon.iconset/icon_16x16.png
sips -z 32 32     icon.png --out icon.iconset/icon_16x16@2x.png
sips -z 32 32     icon.png --out icon.iconset/icon_32x32.png
sips -z 64 64     icon.png --out icon.iconset/icon_32x32@2x.png
sips -z 128 128   icon.png --out icon.iconset/icon_128x128.png
sips -z 256 256   icon.png --out icon.iconset/icon_128x128@2x.png
sips -z 256 256   icon.png --out icon.iconset/icon_256x256.png
sips -z 512 512   icon.png --out icon.iconset/icon_256x256@2x.png
sips -z 512 512   icon.png --out icon.iconset/icon_512x512.png
cp icon.png       icon.iconset/icon_512x512@2x.png
iconutil -c icns icon.iconset -o icon.icns
rm -rf icon.iconset
```

### Windows — `.ico` 만들기

```bash
# ImageMagick 사용
brew install imagemagick    # macOS
convert icon.png -define icon:auto-resize=256,128,96,64,48,32,16 icon.ico
```

## 웹에서 데스크탑 기능 호출하기

데스크탑 앱은 페이지에 `window.ninfl` 객체를 주입합니다.
ninfle.kr 코드에서 다음과 같이 사용하세요.

```ts
// src/lib/desktop.ts 같은 곳에 두면 좋습니다
declare global {
  interface Window {
    ninfl?: {
      isDesktop: boolean;
      platform: string;
      notify: (p: { title: string; body: string; silent?: boolean; urgent?: boolean }) => Promise<boolean>;
      openExternal: (url: string) => Promise<boolean>;
      getVersion: () => Promise<string>;
      setBadge: (count: number) => Promise<boolean>;
    };
  }
}

export const isDesktop = () => typeof window !== 'undefined' && !!window.ninfl?.isDesktop;

export async function notify(title: string, body: string) {
  if (isDesktop()) {
    await window.ninfl!.notify({ title, body });
  } else if ('Notification' in window && Notification.permission === 'granted') {
    new Notification(title, { body });
  }
}
```

이렇게 작성하면 데스크탑 앱에서는 네이티브 OS 알림이 뜨고,
일반 브라우저에서는 표준 웹 Notification API 폴백이 동작합니다.

## 보안 모델

- `contextIsolation: true` + `sandbox: true` + `nodeIntegration: false`
- `devTools: false` — DevTools 자체를 비활성화
- 키보드 단축키(F12, Cmd+Opt+I 등) 글로벌 차단
- `webSecurity: true` — CORS/CSP 표준 적용
- 외부 도메인 이동 차단 (ninfle.kr origin만 인앱 로드)
- 권한 요청은 알림/클립보드 외 모두 거부

자세한 보안 한계는 상위 문서를 참고하세요. Electron은 일반 사용자에 대한
강력한 장벽이지만, 작정한 사용자의 `.asar` 추출이나 프록시 가로채기를
완전히 막지는 않습니다. 진짜 보안은 백엔드(Supabase RLS, API 검증)에서 확보하세요.

## 코드 서명 (선택)

코드 서명이 없으면 macOS Gatekeeper와 Windows SmartScreen이 경고를 띄웁니다.
일반 사용자에게 안내하려면 `/download` 페이지에 "확인되지 않은 개발자 우회 방법" 안내를 두세요.

향후 인증서 구매 시
- macOS: Apple Developer Program ($99/년) → `notarize` 추가
- Windows: 코드사인 인증서 (Sectigo/DigiCert, 연 $200~) → `electron-builder` win.certificateFile 옵션
