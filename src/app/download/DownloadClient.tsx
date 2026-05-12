'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { isDesktop, getDesktopPlatform, getDesktopVersion } from '@/lib/desktop';

const GH_REPO = 'orange0717/naver-influencer';
const RELEASES_URL = `https://github.com/${GH_REPO}/releases`;
const LATEST_API = `https://api.github.com/repos/${GH_REPO}/releases/latest`;

type OS = 'mac-arm' | 'mac-intel' | 'win' | 'linux' | 'unknown';

type Asset = {
  name: string;
  browser_download_url: string;
  size: number;
};

type Release = {
  tag_name: string;
  name: string;
  html_url: string;
  published_at: string;
  assets: Asset[];
};

function detectOS(): OS {
  if (typeof navigator === 'undefined') return 'unknown';
  const ua = navigator.userAgent;
  const platform = (navigator.platform || '').toLowerCase();

  if (/Win/i.test(ua) || /win/.test(platform)) return 'win';
  if (/Linux/i.test(ua) && !/Android/i.test(ua)) return 'linux';

  if (/Mac/i.test(ua) || /mac/.test(platform)) {
    // JS만으로 Apple Silicon / Intel 정확 판정은 불가능합니다.
    // navigator.userAgentData.getHighEntropyValues(['architecture'])가 가장 정확하지만
    // Safari/Firefox 미지원입니다. 현재 시점(2026)에 신규 Mac은 대부분 Apple Silicon이므로
    // 기본값은 mac-arm으로 두고, 페이지에서 Intel 옵션도 동등하게 노출합니다.
    return 'mac-arm';
  }
  return 'unknown';
}

function osLabel(os: OS): string {
  switch (os) {
    case 'mac-arm':
      return 'macOS (Apple Silicon)';
    case 'mac-intel':
      return 'macOS (Intel)';
    case 'win':
      return 'Windows';
    case 'linux':
      return 'Linux';
    default:
      return '알 수 없는 OS';
  }
}

function matchAsset(assets: Asset[], patterns: RegExp[]): Asset | null {
  for (const p of patterns) {
    const hit = assets.find(a => p.test(a.name));
    if (hit) return hit;
  }
  return null;
}

function buildLinks(release: Release | null) {
  if (!release) return null;
  const a = release.assets;
  const installer = matchAsset(a, [/Setup\s.*\.exe$/i, /-setup-.*\.exe$/i]);
  const allExes = a.filter(x => /\.exe$/i.test(x.name));
  const portable = allExes.find(x => !installer || x.name !== installer.name) || null;
  return {
    macArm: matchAsset(a, [/-arm64\.dmg$/i, /arm64.*\.dmg$/i]),
    macIntel: matchAsset(a, [/-x64\.dmg$/i, /^(?!.*arm64).*\.dmg$/i]),
    winInstaller: installer,
    winPortable: portable,
    linuxAppImage: matchAsset(a, [/\.AppImage$/i]),
    linuxDeb: matchAsset(a, [/\.deb$/i]),
  };
}

function formatSize(bytes: number): string {
  if (!bytes) return '';
  const mb = bytes / 1024 / 1024;
  return `${mb.toFixed(1)} MB`;
}

export default function DownloadClient() {
  const [os, setOS] = useState<OS>('unknown');
  const [release, setRelease] = useState<Release | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [inApp, setInApp] = useState(false);
  const [appVersion, setAppVersion] = useState<string | null>(null);
  const [appPlatform, setAppPlatform] = useState<string | null>(null);

  useEffect(() => {
    setOS(detectOS());
    setInApp(isDesktop());
    setAppPlatform(getDesktopPlatform());
    getDesktopVersion().then(v => setAppVersion(v));

    let cancelled = false;
    fetch(LATEST_API, { headers: { Accept: 'application/vnd.github+json' } })
      .then(r => {
        if (!r.ok) throw new Error(`GitHub API ${r.status}`);
        return r.json();
      })
      .then((data: Release) => {
        if (!cancelled) setRelease(data);
      })
      .catch((e: Error) => {
        if (!cancelled) setError(e.message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const links = useMemo(() => buildLinks(release), [release]);
  const version = release?.tag_name?.replace(/^desktop-v/, '') || '';

  // ─────── 이미 데스크탑 앱을 쓰고 있는 사용자 ───────
  if (inApp) {
    return (
      <div className="max-w-2xl mx-auto py-16 px-4 text-center">
        <div className="inline-flex items-center gap-2 px-4 py-2 bg-accent/10 text-accent text-xs font-bold rounded-full mb-6">
          데스크탑 앱 사용 중
        </div>
        <h1 className="text-2xl font-bold text-text mb-3">
          이미 N인플 데스크탑 앱으로 접속 중입니다
        </h1>
        <p className="text-sm text-dim leading-relaxed mb-8">
          {appPlatform && <>플랫폼: <span className="font-semibold">{appPlatform}</span> · </>}
          {appVersion && <>버전: <span className="font-semibold">v{appVersion}</span></>}
        </p>
        <Link
          href="/my"
          className="inline-block px-6 py-3 bg-accent text-white text-sm font-bold rounded-xl hover:bg-accent/90 transition"
        >
          대시보드로 이동
        </Link>
      </div>
    );
  }

  // ─────── 일반 웹 사용자 ───────
  return (
    <div className="max-w-3xl mx-auto py-12 px-4">
      {/* 헤더 */}
      <div className="text-center mb-12">
        <p className="text-xs text-accent font-bold tracking-widest mb-3">DESKTOP APP</p>
        <h1 className="font-title text-3xl md:text-4xl font-extrabold text-text mb-4">
          N인플을 데스크탑 앱으로
        </h1>
        <p className="text-sm md:text-base text-dim leading-relaxed">
          브라우저 탭에 묻히지 않고 빠르게 실행하세요.<br />
          키워드 변동, 인플루언서 선정을 OS 알림으로 즉시 받아볼 수 있습니다.
        </p>
      </div>

      {/* 메인 다운로드 카드 — 사용자 OS 강조 */}
      <PrimaryDownloadCard
        os={os}
        links={links}
        loading={loading}
        error={error}
        version={version}
      />

      {/* 전체 플랫폼 목록 */}
      <div className="mt-10">
        <h2 className="text-sm font-bold text-text mb-4">전체 플랫폼</h2>
        <div className="grid sm:grid-cols-2 gap-3">
          <PlatformRow
            label="macOS Apple Silicon"
            sub="M1/M2/M3/M4 Mac"
            asset={links?.macArm}
            fallback={RELEASES_URL}
          />
          <PlatformRow
            label="macOS Intel"
            sub="Intel Mac"
            asset={links?.macIntel}
            fallback={RELEASES_URL}
          />
          <PlatformRow
            label="Windows 인스톨러"
            sub="설치 후 시작메뉴 등록"
            asset={links?.winInstaller}
            fallback={RELEASES_URL}
          />
          <PlatformRow
            label="Windows 포터블"
            sub="설치 없이 실행"
            asset={links?.winPortable}
            fallback={RELEASES_URL}
          />
          <PlatformRow
            label="Linux AppImage"
            sub="모든 배포판"
            asset={links?.linuxAppImage}
            fallback={RELEASES_URL}
          />
          <PlatformRow
            label="Linux Debian/Ubuntu"
            sub=".deb 패키지"
            asset={links?.linuxDeb}
            fallback={RELEASES_URL}
          />
        </div>
        <p className="text-xs text-dim mt-4 text-center">
          모든 버전은{' '}
          <a
            href={RELEASES_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="text-accent hover:underline"
          >
            GitHub Releases
          </a>
          에서도 확인할 수 있습니다.
        </p>
      </div>

      {/* 주요 기능 */}
      <div className="mt-12 grid md:grid-cols-3 gap-4">
        <FeatureCard
          title="네이티브 알림"
          desc="키워드 변동, 인플루언서 선정 결과를 OS 알림으로 즉시 확인."
        />
        <FeatureCard
          title="트레이 상주"
          desc="창을 닫아도 백그라운드에서 알림 수신. Dock·작업표시줄 한 곳에서 실행."
        />
        <FeatureCard
          title="빠른 접근"
          desc="브라우저 탭을 찾을 필요 없이 앱 아이콘 한 번으로 대시보드 진입."
        />
      </div>

      {/* 설치 시 경고 안내 */}
      <SecurityWarning />

      {/* 푸터 */}
      <div className="mt-12 pt-8 border-t border-border text-center text-xs text-dim">
        문제가 있나요?{' '}
        <a href="mailto:orange@orangelibrary.co.kr" className="text-accent hover:underline">
          orange@orangelibrary.co.kr
        </a>
      </div>
    </div>
  );
}

// ────────────────────────── Sub Components ──────────────────────────

function PrimaryDownloadCard({
  os,
  links,
  loading,
  error,
  version,
}: {
  os: OS;
  links: ReturnType<typeof buildLinks>;
  loading: boolean;
  error: string | null;
  version: string;
}) {
  if (loading) {
    return (
      <div className="bg-surface border border-border rounded-2xl p-8 text-center">
        <div className="w-6 h-6 border-2 border-accent/30 border-t-accent rounded-full animate-spin mx-auto mb-3" />
        <p className="text-sm text-dim">최신 버전 정보를 불러오는 중...</p>
      </div>
    );
  }

  if (error || !links) {
    return (
      <div className="bg-surface border border-border rounded-2xl p-8 text-center">
        <p className="text-sm text-text font-semibold mb-2">
          아직 공개된 버전이 없습니다
        </p>
        <p className="text-xs text-dim mb-5">
          잠시 후 다시 확인해주세요. 또는 GitHub Releases 페이지에서 진행 상태를 확인할 수 있습니다.
        </p>
        <a
          href={RELEASES_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-block px-5 py-2.5 bg-accent text-white text-xs font-bold rounded-xl hover:bg-accent/90 transition"
        >
          GitHub Releases 보기
        </a>
      </div>
    );
  }

  // 추천 다운로드 결정
  let primary: Asset | null | undefined = null;
  let primaryLabel = '';
  switch (os) {
    case 'mac-arm':
      primary = links.macArm || links.macIntel;
      primaryLabel = links.macArm ? 'macOS (Apple Silicon)' : 'macOS (Intel)';
      break;
    case 'mac-intel':
      primary = links.macIntel || links.macArm;
      primaryLabel = 'macOS (Intel)';
      break;
    case 'win':
      primary = links.winInstaller || links.winPortable;
      primaryLabel = links.winInstaller ? 'Windows 인스톨러' : 'Windows 포터블';
      break;
    case 'linux':
      primary = links.linuxAppImage || links.linuxDeb;
      primaryLabel = links.linuxAppImage ? 'Linux AppImage' : 'Linux .deb';
      break;
    default:
      primary = null;
  }

  return (
    <div className="bg-gradient-to-br from-accent/10 via-bg to-bg border border-accent/20 rounded-2xl p-8 md:p-10 text-center">
      <p className="text-xs text-dim mb-2">
        감지된 OS: <span className="font-semibold text-text">{osLabel(os)}</span>
      </p>
      <h2 className="text-xl md:text-2xl font-bold text-text mb-1">
        {primaryLabel || '내 OS에 맞는 버전'} 다운로드
      </h2>
      {version && (
        <p className="text-xs text-dim mb-6">
          최신 버전 v{version}
          {primary?.size ? ` · ${formatSize(primary.size)}` : ''}
        </p>
      )}
      {primary ? (
        <a
          href={primary.browser_download_url}
          className="inline-flex items-center gap-2 px-8 py-4 bg-accent text-white text-base font-bold rounded-xl hover:bg-accent/90 transition shadow-lg"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
            <polyline points="7 10 12 15 17 10" />
            <line x1="12" y1="15" x2="12" y2="3" />
          </svg>
          다운로드
        </a>
      ) : (
        <a
          href={RELEASES_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-block px-6 py-3 bg-accent text-white text-sm font-bold rounded-xl hover:bg-accent/90 transition"
        >
          모든 버전 보기
        </a>
      )}
    </div>
  );
}

function PlatformRow({
  label,
  sub,
  asset,
  fallback,
}: {
  label: string;
  sub: string;
  asset?: Asset | null;
  fallback: string;
}) {
  const href = asset?.browser_download_url || fallback;
  const isDirect = !!asset;
  return (
    <a
      href={href}
      target={isDirect ? undefined : '_blank'}
      rel={isDirect ? undefined : 'noopener noreferrer'}
      className="flex items-center justify-between gap-3 px-4 py-3 bg-surface border border-border rounded-xl hover:border-accent/40 hover:bg-bg transition"
    >
      <div className="min-w-0">
        <p className="text-sm font-semibold text-text truncate">{label}</p>
        <p className="text-xs text-dim truncate">
          {sub}
          {asset?.size ? ` · ${formatSize(asset.size)}` : ''}
        </p>
      </div>
      <span className="shrink-0 text-xs font-bold text-accent">
        {isDirect ? '다운로드' : '보기'} →
      </span>
    </a>
  );
}

function FeatureCard({ title, desc }: { title: string; desc: string }) {
  return (
    <div className="bg-surface border border-border rounded-xl p-5">
      <p className="text-sm font-bold text-text mb-1.5">{title}</p>
      <p className="text-xs text-dim leading-relaxed">{desc}</p>
    </div>
  );
}

function SecurityWarning() {
  return (
    <div className="mt-12 bg-surface border border-border rounded-2xl p-6">
      <p className="text-sm font-bold text-text mb-3">설치 시 경고가 뜬다면</p>
      <div className="space-y-3 text-xs text-dim leading-relaxed">
        <div>
          <p className="font-semibold text-text">macOS — &quot;확인되지 않은 개발자&quot; 경고</p>
          <p className="mt-1">
            시스템 설정 → <strong>개인정보 보호 및 보안</strong> → 아래로 스크롤해
            &quot;N인플은 확인된 개발자가 만들지 않았기 때문에...&quot; 메시지 옆의{' '}
            <strong>그대로 열기</strong> 버튼을 누르세요.
          </p>
        </div>
        <div>
          <p className="font-semibold text-text">Windows — SmartScreen &quot;PC 보호&quot; 경고</p>
          <p className="mt-1">
            <strong>추가 정보</strong> 클릭 → <strong>실행</strong> 버튼을 누르세요.
          </p>
        </div>
        <p className="pt-2 border-t border-border text-[11px]">
          코드 서명 인증서를 도입하면 위 경고는 사라집니다(예정).
        </p>
      </div>
    </div>
  );
}
