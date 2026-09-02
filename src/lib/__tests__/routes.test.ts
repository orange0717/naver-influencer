import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import {
  ROUTES,
  isBlockedByRobots,
  privateRoutes,
  publicRoutes,
  robotsAllowPaths,
  robotsDisallowPaths,
  sitemapRoutes,
} from '../routes';

/** src/app 의 실제 page 파일에서 라우트 경로를 뽑는다. 동적 세그먼트는 [id] 그대로 둔다. */
function appRoutes(dir: string, base = ''): string[] {
  const out: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (!entry.isDirectory()) {
      if (/^page\.tsx?$/.test(entry.name)) out.push(base || '/');
      continue;
    }
    // route group '(...)' 는 URL 에 나타나지 않는다
    const segment = /^\(.*\)$/.test(entry.name) ? '' : `/${entry.name}`;
    out.push(...appRoutes(path.join(dir, entry.name), base + segment));
  }
  return out;
}

const APP_ROUTES = appRoutes(path.resolve(__dirname, '../../app'));

describe('lib/routes 단일 소스', () => {
  it('src/app 의 모든 라우트가 ROUTES 접두사에 덮인다', () => {
    const prefixes = ROUTES.map(r => r.path);
    const uncovered = APP_ROUTES.filter(
      route => !prefixes.some(p => p === '/' || route === p || route.startsWith(`${p}/`)),
    );
    expect(uncovered).toEqual([]);
  });

  it('private 경로는 전부 robots 로 차단된다', () => {
    const leaked = privateRoutes().filter(r => !isBlockedByRobots(r.path));
    expect(leaked.map(r => r.path)).toEqual([]);
  });

  it('public 경로는 robots 로 차단되지 않는다', () => {
    const blocked = publicRoutes().filter(r => isBlockedByRobots(r.path));
    expect(blocked.map(r => r.path)).toEqual([]);
  });

  it('sitemap 등재 경로가 disallow 와 겹치지 않는다', () => {
    const conflicts = sitemapRoutes().filter(r => isBlockedByRobots(r.path));
    expect(conflicts.map(r => r.path)).toEqual([]);
  });

  it('private 경로에는 사유가 남아 있다', () => {
    expect(privateRoutes().filter(r => !r.reason)).toEqual([]);
  });

  it('중복 선언이 없다', () => {
    const paths = ROUTES.map(r => r.path);
    expect(paths.length).toBe(new Set(paths).size);
  });

  it('Disallow 는 bare 와 trailing-slash 두 형태로 전개된다', () => {
    const disallow = robotsDisallowPaths();
    for (const r of privateRoutes()) {
      expect(disallow).toContain(r.path);
      expect(disallow).toContain(`${r.path}/`);
    }
  });

  it('Allow 에는 루트와 private 하위 예외만 들어간다', () => {
    const allow = robotsAllowPaths();
    expect(allow).toContain('/');
    for (const p of allow) {
      if (p === '/') continue;
      expect(privateRoutes().some(r => p.startsWith(`${r.path}/`))).toBe(true);
    }
  });
});
