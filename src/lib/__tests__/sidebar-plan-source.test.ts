import { describe, expect, it } from 'vitest';
import { FEATURES } from '../plans';
import { SIDEBAR_GROUPS, itemRequiredPlan, itemLocksNavigation } from '../sidebar-nav';

const items = SIDEBAR_GROUPS.flatMap((g) => g.items);

describe('사이드바 등급은 plans.ts 가 정본이다', () => {
  // FeatureKey 가 string 이라 오타는 컴파일을 통과하고 배지만 조용히 사라진다.
  // 서버는 계속 막는데 메뉴만 무료로 보이는 상태 — 2026-09-03 노출 현황이 정확히 그랬다.
  it.each(items.filter((i) => i.feature))('$label 의 기능 키가 FEATURES 에 있다', (item) => {
    expect(FEATURES[item.feature!]).toBeDefined();
    expect(itemRequiredPlan(item)).toBe(FEATURES[item.feature!].minPlan);
  });

  it('등급이 필요한 메뉴는 feature 로만 선언한다', () => {
    for (const item of items) {
      expect(Object.keys(item)).not.toContain('requiredPlan');
    }
  });

  it('노출 현황은 Pro 배지를 달되 링크를 잠그지 않는다', () => {
    const item = items.find((i) => i.href === '/my/missing-posts')!;
    // 2026-09-04 Max → Pro. 배지는 plans.ts 파생이라 이 한 줄만 따라 바뀐다.
    expect(itemRequiredPlan(item)).toBe('pro');
    // 잠그면 Free 회원이 /subscribe 로 튕겨 티저(최근 7일·5건)에 도달할 수 없다.
    expect(itemLocksNavigation(item)).toBe(false);
  });

  // 지시서 §1 — 노출 검사 4종은 전부 Pro 다. 등급은 여기 한 곳에서만 선언하므로
  // 이 셋이 어긋나면 화면·서버·사이드바가 한꺼번에 어긋난다.
  it('노출 검사 4종은 모두 Pro 다', () => {
    expect({
      '노출 현황': FEATURES['my.missing-posts'].minPlan,
      '키워드 순위': FEATURES['my.keyword-ranking'].minPlan,
      'AI 브리핑·AI 탭 인용': FEATURES['my.naver-mate'].minPlan,
    }).toEqual({
      '노출 현황': 'pro',
      '키워드 순위': 'pro',
      'AI 브리핑·AI 탭 인용': 'pro',
    });
  });
});
