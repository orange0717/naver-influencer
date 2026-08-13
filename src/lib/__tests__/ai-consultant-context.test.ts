import { describe, it, expect } from 'vitest';
import { classifyIntents } from '../ai-consultant-context';

// 의도 분류는 "어떤 N인플 데이터를 조회할지"를 정하는 관문이라, 스펙의 대표 질문들이
// 올바른 의도로 떨어지는지 고정한다. 실제 데이터 조회/그라운딩은 DB·env 가 필요해 별도 검증.

describe('classifyIntents', () => {
  it('인플루언서 추천 질문 → influencer-reco', () => {
    expect(classifyIntents('자동차 광고를 하려고 하는데 인플루언서 추천해줄래?')).toContain('influencer-reco');
  });

  it('미노출 질문 → missing-post', () => {
    expect(classifyIntents('글이 미노출되었는지 확인해줄래?')).toContain('missing-post');
  });

  it('내 블로그 방문자 질문 → my-blog', () => {
    expect(classifyIntents('내 블로그 방문자가 줄었는데 어떻게 해야 해?')).toContain('my-blog');
  });

  it('내 키워드 순위 질문 → my-keyword-ranking', () => {
    expect(classifyIntents('내 키워드 순위가 올랐는지 확인하고 싶어')).toContain('my-keyword-ranking');
  });

  it('일반 지식 질문(ROAS)은 데이터 조회 없이 general', () => {
    expect(classifyIntents('ROAS가 뭐야?')).toEqual(['general']);
  });

  it('한 질문이 여러 의도를 가질 수 있다', () => {
    const intents = classifyIntents('내 블로그 미노출도 궁금하고 인플루언서도 추천받고 싶어');
    expect(intents).toContain('missing-post');
    expect(intents).toContain('influencer-reco');
    expect(intents).not.toContain('general');
  });
});
