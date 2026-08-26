import { describe, it, expect } from 'vitest';
import { looksLikeParsedNaverId } from '../blog-utils';

/**
 * 크롤 결과의 네이버 ID 판정 회귀 테스트.
 *
 * 배경(2026-08-25): crawl-rankings 의 extractNaverId() 는 프로필 링크를 못 읽으면
 * '' 나 URL 조각을 돌려준다. 그 값이 influencers.naver_id 로 upsert(onConflict: naver_id)
 * 되면 파싱에 실패한 서로 다른 인플루언서가 **한 행으로 합쳐져서**, 그 행의
 * avg_rank·keyword_score·ninfl_rank 가 남의 순위를 섞은 값이 되고 그대로 순위 화면에 나간다.
 *
 * 그렇다고 허용목록으로 조이면 반대 사고가 난다 — 이 저장소는 네이버 ID의 `.`·`-` 를 거르는
 * 검증 때문에 멀쩡한 인플루언서의 챌린지 실적이 조용히 0으로 굳은 이력이 있다.
 *
 * 그래서 이 테스트가 지키려는 불변식은 두 방향이다:
 *   1) 파싱 실패의 잔해(빈 값·URL·쿼리 조각)는 반드시 거른다.
 *   2) 실제로 쓰이는 형태의 ID는 **절대** 거르지 않는다. ← 이쪽이 더 위험하다
 */

describe('looksLikeParsedNaverId — 파싱 실패 잔해를 거른다', () => {
  it.each([
    ['빈 문자열', ''],
    ['공백뿐', '   '],
    ['null', null],
    ['undefined', undefined],
  ])('%s 은 ID가 아니다 — 이게 통과하면 naver_id="" 유령 행이 생긴다', (_label, value) => {
    expect(looksLikeParsedNaverId(value)).toBe(false);
  });

  it.each([
    ['전체 URL', 'https://in.naver.com/orangelibrary'],
    ['프로토콜 상대 URL', 'http://blog.naver.com/orangelibrary'],
    ['경로가 남은 조각', 'in.naver.com/orangelibrary'],
    ['쿼리가 붙은 조각', 'orangelibrary?areacode=abc'],
    ['앰퍼샌드', 'a&b'],
    ['해시', 'orange#top'],
    ['공백 포함', 'orange library'],
  ])('%s 은 ID가 아니다', (_label, value) => {
    expect(looksLikeParsedNaverId(value)).toBe(false);
  });

  /**
   * 실제로 프로덕션에 들어갔던 값과 그 변형들.
   * naver_id='오후 10:00' / display_name='오후열시' 인 껍데기 인플루언서 행이 생겼었다 —
   * ID 자리에 포스팅 시각 표기가 들어간 것이다. '오후열시'라는 블로거는 존재하지 않는다.
   * 공백 규칙이 원본은 막았지만 공백 없는 변형은 전부 통과했다.
   */
  it.each([
    ['실제 사고값 — 포스팅 시각', '오후 10:00'],
    ['공백 없는 변형', '오후10:00'],
    ['시각만', '10:00'],
    ['24시간 표기', '22:00'],
    ['태그 잔해', '<a'],
    ['속성 따옴표 잔해', '"orangelibrary"'],
  ])('%s 은 ID가 아니다 — 이게 통과하면 껍데기 인플루언서 행이 생긴다', (_label, value) => {
    expect(looksLikeParsedNaverId(value)).toBe(false);
  });
});

describe('looksLikeParsedNaverId — 멀쩡한 ID는 절대 거르지 않는다', () => {
  it.each([
    ['일반', 'orangelibrary'],
    ['언더스코어 (오렌지 블로그)', 'orangelibrary_'],
    ['하이픈 — 예전에 이걸 걸러서 실적이 0으로 굳었다', 'orange-library'],
    ['점 — 위와 같은 사고', 'orange.library'],
    ['점과 하이픈 동시', 'a.b-c_d'],
    ['숫자만', '12345678'],
    ['한 글자', 'a'],
    ['대문자 섞임', 'OrangeLibrary'],
  ])('%s 는 ID로 인정한다', (_label, value) => {
    expect(looksLikeParsedNaverId(value)).toBe(true);
  });

  it('앞뒤 공백은 잘라내고 판정한다 — 마크업 들여쓰기 때문에 멀쩡한 ID를 버리지 않도록', () => {
    expect(looksLikeParsedNaverId('  orangelibrary_  ')).toBe(true);
  });
});
