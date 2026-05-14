import fs from 'fs';
import path from 'path';
import { NextResponse } from 'next/server';

/**
 * GitHub Releases 메타를 서버에서 가져와 /download 페이지에 제공합니다.
 * - GITHUB_TOKEN 이 있으면 API 한도가 커집니다.
 * - latest / 목록 조회가 비어도 desktop-v* 태그 직접 조회 → 마지막으로 electron-builder
 *   규칙에 맞는 합성 browser_download_url (GitHub releases/download/...) 을 시도합니다.
 */
const DEFAULT_REPO = 'orange0717/naver-influencer';

type RawAsset = { name: string; browser_download_url: string; size: number };

type RawRelease = {
  tag_name: string;
  name: string;
  html_url: string;
  published_at: string;
  draft: boolean;
  prerelease: boolean;
  assets: RawAsset[];
};

function ghHeaders(): HeadersInit {
  const h: Record<string, string> = {
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
    'User-Agent': 'ninfle.kr-desktop-release/1',
  };
  const tok = process.env.GITHUB_TOKEN;
  if (tok) {
    h.Authorization = `Bearer ${tok}`;
  }
  return h;
}

function slim(r: RawRelease) {
  return {
    tag_name: r.tag_name,
    name: r.name,
    html_url: r.html_url,
    published_at: r.published_at,
    assets: r.assets.map(a => ({
      name: a.name,
      browser_download_url: a.browser_download_url,
      size: a.size,
    })),
  };
}

/** 릴리스 후보: 설치에 쓰이는 바이너리가 하나라도 있으면 채택 */
function hasDesktopAssets(r: RawRelease): boolean {
  return r.assets.some(a => {
    const n = a.name;
    return (
      /\.(exe|dmg|AppImage|deb)$/i.test(n) ||
      /-(arm64|x64)-mac\.zip$/i.test(n) ||
      /mac.*\.zip$/i.test(n)
    );
  });
}

function readDesktopVersion(): string {
  const fromEnv = process.env.DESKTOP_APP_VERSION?.trim();
  if (fromEnv) return fromEnv;
  try {
    const p = path.join(process.cwd(), 'desktop', 'package.json');
    const raw = fs.readFileSync(p, 'utf8');
    const j = JSON.parse(raw) as { version?: string };
    if (j.version && /^\d+\.\d+\.\d+/.test(j.version)) return j.version;
  } catch {
    // ignore
  }
  return '0.1.4';
}

function preferredDesktopTag(version: string): string {
  const t = process.env.DESKTOP_RELEASE_TAG?.trim();
  if (t) return t;
  return `desktop-v${version}`;
}

/**
 * API가 자산을 못 줄 때 — GitHub `releases/download/{tag}/{filename}` 규칙으로 링크 구성.
 * (.github/workflows/desktop-release.yml 의 파일명 규칙과 맞춤)
 */
function syntheticDesktopRelease(repo: string, tag: string, version: string) {
  const parts = repo.split('/');
  const owner = parts[0] || 'orange0717';
  const reponame = parts[1] || 'naver-influencer';
  const encTag = encodeURIComponent(tag);
  const base = `https://github.com/${owner}/${reponame}/releases/download/${encTag}`;

  const fileNames = [
    `N인플-${version}-arm64.dmg`,
    `N인플-${version}-x64.dmg`,
    `N인플-${version}.dmg`,
    `N인플 Setup ${version}.exe`,
    `N인플 ${version}.exe`,
    `N인플-${version}.AppImage`,
    `ninfl_${version}_amd64.deb`,
  ];

  const assets: RawAsset[] = fileNames.map(name => ({
    name,
    browser_download_url: `${base}/${encodeURIComponent(name)}`,
    size: 0,
  }));

  const r: RawRelease = {
    tag_name: tag,
    name: `N인플 데스크탑 ${tag}`,
    html_url: `https://github.com/${owner}/${reponame}/releases/tag/${encTag}`,
    published_at: new Date().toISOString(),
    draft: false,
    prerelease: false,
    assets,
  };
  return slim(r);
}

function releaseScore(r: RawRelease): number {
  let s = Date.parse(r.published_at) || 0;
  if (r.tag_name.startsWith('desktop-v')) s += 1e15;
  if (!r.prerelease) s += 1e14;
  return s;
}

async function fetchReleaseByTag(
  base: string,
  tag: string,
  fetchOpts: RequestInit & { next?: { revalidate: number } },
): Promise<RawRelease | null> {
  const res = await fetch(`${base}/releases/tags/${encodeURIComponent(tag)}`, fetchOpts);
  if (!res.ok) return null;
  const data = (await res.json()) as RawRelease;
  if (data.draft || !hasDesktopAssets(data)) return null;
  return data;
}

export async function GET() {
  const repo = process.env.GITHUB_RELEASE_REPO?.trim() || DEFAULT_REPO;
  const base = `https://api.github.com/repos/${repo}`;
  const fetchOpts: RequestInit & { next?: { revalidate: number } } = {
    headers: ghHeaders(),
    next: { revalidate: 180 },
  };

  const cacheOk: HeadersInit = {
    'Cache-Control': 'public, s-maxage=180, stale-while-revalidate=3600',
  };
  const cacheShort: HeadersInit = {
    'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=300',
  };

  const version = readDesktopVersion();
  const fallbackTag = preferredDesktopTag(version);

  try {
    const latestRes = await fetch(`${base}/releases/latest`, fetchOpts);
    if (latestRes.ok) {
      const data = (await latestRes.json()) as RawRelease;
      if (!data.draft && hasDesktopAssets(data)) {
        return NextResponse.json({ release: slim(data), source: 'latest' }, { headers: cacheOk });
      }
    }

    const listRes = await fetch(`${base}/releases?per_page=50`, fetchOpts);
    if (listRes.ok) {
      const list = (await listRes.json()) as RawRelease[];
      if (Array.isArray(list) && list.length) {
        const usable = list
          .filter(r => !r.draft && hasDesktopAssets(r))
          .sort((a, b) => releaseScore(b) - releaseScore(a));

        const picked = usable[0];
        if (picked) {
          return NextResponse.json({ release: slim(picked), source: 'list' }, { headers: cacheOk });
        }
      }
    }

    const byTag = await fetchReleaseByTag(base, fallbackTag, fetchOpts);
    if (byTag) {
      return NextResponse.json({ release: slim(byTag), source: 'tag' }, { headers: cacheOk });
    }

    const synthetic = syntheticDesktopRelease(repo, fallbackTag, version);
    return NextResponse.json(
      {
        release: synthetic,
        source: 'synthetic',
        warning:
          'GitHub API에서 자산 목록을 가져오지 못해, 배포 워크플로 기준 URL을 구성했습니다. 릴리스가 없으면 404가 날 수 있습니다.',
      },
      { headers: cacheShort },
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'fetch_failed';
    const synthetic = syntheticDesktopRelease(repo, fallbackTag, version);
    return NextResponse.json(
      {
        release: synthetic,
        source: 'synthetic_error',
        error: msg,
        warning: 'GitHub 요청 중 오류가 있어 합성 다운로드 URL을 반환했습니다.',
      },
      { status: 200, headers: { 'Cache-Control': 'public, s-maxage=30, stale-while-revalidate=120' } },
    );
  }
}
