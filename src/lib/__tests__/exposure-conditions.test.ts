import { describe, expect, it } from 'vitest';
import {
  EXPOSURE_CONDITIONS, RANK_COUNTING_RULES, SEARCH_USER_AGENT,
  buildSearchUrl, snapshotHash, toKstString,
} from '../exposure-conditions';

describe('조회 조건은 판정과 함께 굳혀 둔다(§3.3)', () => {
  // 조건이 바뀌면 순위도 바뀐다. 그런데 화면 설명은 사람이 손으로 적어 두는 문장이라
  // 코드가 조용히 바뀌어도 문장만 남는다 — 그래서 조건 자체를 상수로 두고 여기서 못 박는다.
  it('검사는 PC · 비로그인 · 한국어로만 한다', () => {
    expect(EXPOSURE_CONDITIONS).toMatchObject({
      device: 'pc',
      loggedIn: false,
      language: 'ko-KR',
      region: null,
    });
  });

  it('UA 는 데스크톱이다 — 모바일 UA 로 조회하면 순위가 달라진다', () => {
    expect(EXPOSURE_CONDITIONS.userAgent).toBe(SEARCH_USER_AGENT);
    expect(SEARCH_USER_AGENT).toContain('Windows NT');
    expect(SEARCH_USER_AGENT).not.toMatch(/Mobile|Android|iPhone/);
  });
});

describe('검색 URL 생성(§4 조회 URL)', () => {
  it('영역마다 탭 파라미터가 다르다', () => {
    expect(buildSearchUrl('view', 'ㄱ')).toContain('where=webkr');
    expect(buildSearchUrl('blog', 'ㄱ')).toContain('ssc=tab.blog.all');
    expect(buildSearchUrl('influencer', 'ㄱ')).toContain('ssc=tab.influencer.all');
  });

  it('검색어는 인코딩해서 넣는다', () => {
    expect(buildSearchUrl('blog', '강아지 사료')).toContain(`query=${encodeURIComponent('강아지 사료')}`);
  });

  it('start 는 2페이지부터만 붙는다', () => {
    expect(buildSearchUrl('blog', 'ㄱ', 1)).not.toContain('start=');
    expect(buildSearchUrl('blog', 'ㄱ', 11)).toContain('&start=11');
  });
});

describe('스냅샷 지문', () => {
  it('같은 HTML 은 같은 지문, 다른 HTML 은 다른 지문', () => {
    expect(snapshotHash('<html>a</html>')).toBe(snapshotHash('<html>a</html>'));
    expect(snapshotHash('<html>a</html>')).not.toBe(snapshotHash('<html>b</html>'));
    expect(snapshotHash('<html>a</html>')).toMatch(/^[0-9a-f]{16}$/);
  });
});

describe('검사 시각은 KST 로 고정한다(§3.8)', () => {
  // 브라우저 로컬 시간대로 찍으면 같은 판정을 보는 사람마다 다른 시각이 보인다.
  // 그러면 그 시각은 근거가 아니다 — 서버·클라이언트 어디서 부르든 같은 문자열이어야 한다.
  it('UTC 시각을 +9시간으로 옮겨 적는다', () => {
    expect(toKstString('2026-09-04T00:00:00.000Z')).toBe('2026-09-04 09:00:00 KST');
  });

  it('날짜 경계를 넘어가도 맞다', () => {
    expect(toKstString('2026-09-03T15:30:00.000Z')).toBe('2026-09-04 00:30:00 KST');
  });

  it('값이 없거나 깨진 시각이면 빈 문자열 — 지어내지 않는다', () => {
    expect(toKstString(null)).toBe('');
    expect(toKstString(undefined)).toBe('');
    expect(toKstString('언젠가')).toBe('');
  });
});

describe('순위 카운팅 규칙(§3.4)', () => {
  // 규칙 문구는 화면 툴팁의 정본이다. 비면 §6 "검사 조건 없이 순위 숫자만 표시"로 되돌아간다.
  it('규칙이 비어 있지 않다', () => {
    expect(RANK_COUNTING_RULES.length).toBeGreaterThanOrEqual(5);
    for (const r of RANK_COUNTING_RULES) expect(r.trim().length).toBeGreaterThan(10);
  });

  it('제목 문자열로 세지 않는다는 점을 명시한다(§3.2)', () => {
    expect(RANK_COUNTING_RULES.join('\n')).toContain('blogId+logNo');
  });

  it('아직 제공하지 않는 것(섹션 내 위치)을 제공한다고 적지 않는다', () => {
    expect(RANK_COUNTING_RULES.join('\n')).toContain('아직 제공하지 않습니다');
  });
});
