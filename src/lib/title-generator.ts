/**
 * 제목 생성 — 키워드 하나로 SEO·AEO·GEO를 고려한 블로그 제목 후보를 생성하고 4개 지표로 점수화한다.
 */
import { getAnthropicClient, CLAUDE_MODEL_SONNET, parseJsonObjectFromClaudeText } from './claude-client';

export interface GeneratedTitle {
  title: string;
  seoScore: number;
  ctrScore: number;
  aiExposureScore: number;
  naverFitScore: number;
}

const TITLE_COUNT = 20;

const SYSTEM_PROMPT = `당신은 네이버 블로그·인플루언서 콘텐츠의 제목을 짓는 SEO 전문가입니다.
주어진 키워드와 연관 검색어를 참고해, 이 키워드로 글을 쓸 때 쓸 만한 제목 후보 ${TITLE_COUNT}개를 만들고
각 제목을 4가지 기준으로 0~100점 채점하세요.

채점 기준:
- seoScore(SEO): 네이버 검색 최적화 — 키워드가 자연스럽게 포함되고 길이가 적절(20~40자)하며 검색 의도에 부합하는 정도
- ctrScore(예상 클릭률): 궁금증 유발, 구체적 숫자·비교·질문 활용 등으로 실제 클릭을 유도하는 정도
- aiExposureScore(AI노출확률): 네이버 AI브리핑·생성형 검색이 이 제목의 글을 인용하기 좋은, 명확한 사실/답변형 문장인지
- naverFitScore(네이버 적합도): 네이버 블로그·인플루언서 검색 이용자들이 실제로 선호하는 톤·스타일에 맞는 정도

규칙:
- 제목은 서로 다른 각도(비용/비교/방법/이유/시기/후기 등)로 다양하게 구성
- 낚시성 과장 문구, 특수문자 남발, 이모지 금지
- 특정 업종에 치우치지 않고 입력된 키워드의 실제 맥락에만 집중
- 아래 JSON 스키마로만 응답하세요. 마크다운, 코드블록, 설명 문구 없이 순수 JSON만 반환합니다:
{"titles": [{"title": "...", "seoScore": 0, "ctrScore": 0, "aiExposureScore": 0, "naverFitScore": 0}]}`;

export async function generateTitles(keyword: string, relatedKeywords: string[]): Promise<GeneratedTitle[]> {
  const anthropic = getAnthropicClient();
  const userContent = [
    `키워드: ${keyword}`,
    relatedKeywords.length > 0 ? `연관 검색어: ${relatedKeywords.join(', ')}` : '연관 검색어: (데이터 없음)',
  ].join('\n');

  const message = await anthropic.messages.create({
    model: CLAUDE_MODEL_SONNET,
    max_tokens: 4096,
    system: SYSTEM_PROMPT,
    messages: [{ role: 'user', content: userContent }],
  });

  const rawText = message.content[0]?.type === 'text' ? message.content[0].text : '';
  const parsed = parseJsonObjectFromClaudeText<{ titles?: unknown[] }>(rawText);

  const clamp = (v: unknown) => Math.max(0, Math.min(100, Math.round(Number(v) || 0)));

  const titles = Array.isArray(parsed.titles)
    ? parsed.titles
        .filter((t): t is Record<string, unknown> => typeof t === 'object' && t !== null && typeof (t as Record<string, unknown>).title === 'string')
        .map((t) => ({
          title: (t.title as string).trim(),
          seoScore: clamp(t.seoScore),
          ctrScore: clamp(t.ctrScore),
          aiExposureScore: clamp(t.aiExposureScore),
          naverFitScore: clamp(t.naverFitScore),
        }))
        .filter((t) => t.title.length > 0)
    : [];

  return titles.sort((a, b) => {
    const avgB = (b.seoScore + b.ctrScore + b.aiExposureScore + b.naverFitScore) / 4;
    const avgA = (a.seoScore + a.ctrScore + a.aiExposureScore + a.naverFitScore) / 4;
    return avgB - avgA;
  });
}
