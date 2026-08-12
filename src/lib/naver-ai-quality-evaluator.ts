import { getAnthropicClient, CLAUDE_MODEL_SONNET, parseJsonObjectFromClaudeText, UNTRUSTED_DATA_NOTICE, wrapUntrusted } from '@/lib/claude-client';

export const QUALITY_CATEGORY_DEFS = [
  { key: 'experience', label: '실제 경험', max: 20 },
  { key: 'expertise', label: '전문성', max: 15 },
  { key: 'readerFocus', label: '독자 중심성', max: 15 },
  { key: 'process', label: '절차 및 과정 설명', max: 15 },
  { key: 'comparison', label: '비교 및 대안 제시', max: 10 },
  { key: 'results', label: '실제 결과 및 후기', max: 10 },
  { key: 'freshness', label: '최신성', max: 5 },
  { key: 'readability', label: '가독성 및 구조', max: 5 },
  { key: 'imageRelevance', label: '이미지 적합성', max: 5 },
  { key: 'trust', label: '신뢰성 및 투명성', max: 5 },
] as const;

export type QualityCategoryKey = typeof QUALITY_CATEGORY_DEFS[number]['key'];

const EXPOSURE_LEVELS = ['매우 높음', '높음', '보통', '낮음', '매우 낮음'] as const;

interface QualityCategoryResult {
  key: QualityCategoryKey;
  score: number;
  good: string;
  bad: string;
  improvement: string;
}

export interface NaverAiQualityEvaluation {
  totalScore: number;
  starRating: number;
  categories: QualityCategoryResult[];
  aiSearchFitPercent: number;
  /** 인플루언서 글 적합도 — 네이버 인플루언서 콘텐츠(주제 전문성·홈/토픽 노출)로서의 적합도 (스펙 5 병합) */
  influencerFit: { percent: number; reason: string };
  naverExposureLikelihood: typeof EXPOSURE_LEVELS[number];
  goodPoints: string[];
  badPoints: string[];
  top5Improvements: string[];
  suggestedAdditions: string[];
  aiTraces: { label: string; checked: boolean }[];
  seo: { label: string; score: number }[];
  geoAeo: { engine: string; score: number }[];
  conclusion: { score: number; reason: string; topFixes: string[] };
}

const SYSTEM_PROMPT = `당신은 네이버 AI 검색 품질평가 전문가입니다. 입력된 블로그 글 한 편을 네이버가 공개한 AI 검색 콘텐츠 가이드라인 기준으로 객관적으로 채점합니다. 절대로 주관적으로 평가하지 말고, 아래 배점표를 엄격히 따르세요.

평가항목 (총 10개, 항목별 배점)
1. experience (실제 경험, 20점): 직접 경험 여부, 실패 경험, 과정 서술, 사용후기, 직접 촬영 사진 정황, 실제 수치. 18~20=매우 풍부, 12~17=일부 있음, 6~11=부족, 0~5=AI 일반론 수준.
2. expertise (전문성, 15점): 공식기관 자료, 통계자료, 논문, 정부자료, 전문가 인용, 출처 링크. 13~15=충분, 8~12=일부, 0~7=근거 부족.
3. readerFocus (독자 중심성, 15점): 누가 읽는 글인지 명확한가, 상황(TPO), 문제 해결 가능 여부, 독자가 얻는 것.
4. process (절차 및 과정 설명, 15점): 순서대로 설명, 실패, 시행착오, 주의사항, 팁, 시간 흐름.
5. comparison (비교 및 대안 제시, 10점): 비교 대상 존재, 장단점, 선택 이유, 상황별 추천.
6. results (실제 결과 및 후기, 10점): 적용 결과, 전후 비교, 수치 변화, 예상과 다른 점, 아쉬운 점.
7. freshness (최신성, 5점): 최신 정보 반영, 최근 기준, 수정 필요 여부.
8. readability (가독성 및 구조, 5점): H2/H3, 표, 목차, 리스트, 문단 구성.
9. imageRelevance (이미지 적합성, 5점): 본문과의 관련성, 직접 촬영 정황, 인포그래픽/설명 이미지, 텍스트와의 연결.
10. trust (신뢰성 및 투명성, 5점): 협찬 여부 표시, 내돈내산 여부, 출처 표시, 과장 표현, 허위정보 여부.

각 항목마다 반드시 score(정수, 배점 범위 내), good(좋은점), bad(부족한점), improvement(구체적 개선방법)을 작성하세요. 점수만 출력하지 마세요.

추가 분석:
- aiTraces: 아래 8개 항목 각각에 대해 실제로 해당 문제가 글에서 관찰되는지 checked(true/false)로 판정: "일반론이 많음","경험 부족","사례 부족","반복 문장","과장 표현","근거 없음","출처 없음","실제 사진 부족"
- seo: 아래 9개 항목을 각 100점 기준으로 평가: "제목","소제목","키워드","목차","메타설명","FAQ","내부링크","외부링크","구조화"
- geoAeo: 아래 6개 AI 검색엔진 각각에서 이 글이 인용/노출될 가능성을 100점 기준으로 평가: "ChatGPT","Gemini","Claude","Perplexity","네이버 AI브리핑","AI Overviews"
- goodPoints: 좋았던 점 5가지
- badPoints: 부족했던 점 5가지
- top5Improvements: 수정하면 가장 점수가 많이 오르는 부분 5가지 (우선순위 순서대로)
- suggestedAdditions: 추가하면 좋은 내용을 구체적으로 제안 (실제 경험/사진/비교표/통계자료/FAQ/공식자료 등 구체적으로)
- naverExposureLikelihood: "매우 높음"|"높음"|"보통"|"낮음"|"매우 낮음" 중 하나
- aiSearchFitPercent: AI 검색 적합도 (0~100 정수)
- influencerFit: 네이버 인플루언서 콘텐츠로서의 적합도. { percent(0~100 정수), reason(이유 1~2문장) }. 특정 주제에 대한 전문성·일관성, 인플루언서 홈/토픽에 노출될 만한 깊이, 검색+AI 인용 잠재력을 종합해 판단. 잡다한 일상글일수록 낮고, 한 주제를 깊게 다룬 전문 콘텐츠일수록 높다.
- conclusion: { score(100점 만점 재평가), reason(왜 그런 점수인지), topFixes(가장 먼저 수정해야 할 3가지) }
- totalScore: 위 10개 항목 점수의 합
- starRating: totalScore 기준 1~5 (정수, 반올림)

아래 JSON 스키마로만 응답하세요. 마크다운, 코드블록, 설명 문구 없이 순수 JSON만 반환합니다:
{
  "totalScore": number,
  "starRating": number,
  "categories": [ { "key": "experience", "score": number, "good": string, "bad": string, "improvement": string }, ... 10개 전부 ],
  "aiSearchFitPercent": number,
  "influencerFit": { "percent": number, "reason": string },
  "naverExposureLikelihood": string,
  "goodPoints": string[5],
  "badPoints": string[5],
  "top5Improvements": string[5],
  "suggestedAdditions": string[],
  "aiTraces": [ { "label": string, "checked": boolean }, ... 8개 전부 ],
  "seo": [ { "label": string, "score": number }, ... 9개 전부 ],
  "geoAeo": [ { "engine": string, "score": number }, ... 6개 전부 ],
  "conclusion": { "score": number, "reason": string, "topFixes": string[3] }
}

규칙: 한국어로 작성. categories의 key는 반드시 experience/expertise/readerFocus/process/comparison/results/freshness/readability/imageRelevance/trust 10개를 이 순서대로 모두 포함.

${UNTRUSTED_DATA_NOTICE}`;

export interface StructuralHints {
  charCount: number;
  imageCount: number;
  originalImageCount: number;
  videoCount: number;
  linkCount: number;
  internalLinkCount: number;
  tableCount: number;
  listItemCount: number;
  quotationCount: number;
  headingCount: number;
  personalPronounCount: number;
  faqDetected: boolean;
}

export async function evaluateNaverAiSearchQuality(
  apiKey: string,
  title: string,
  text: string,
  hints: StructuralHints,
): Promise<NaverAiQualityEvaluation> {
  const anthropic = getAnthropicClient(apiKey);

  const message = await anthropic.messages.create({
    model: CLAUDE_MODEL_SONNET,
    max_tokens: 4096,
    system: SYSTEM_PROMPT,
    messages: [{
      role: 'user',
      content: `구조적 지표 (참고용, 채점 시 함께 고려):
- 글자수: ${hints.charCount}자
- 이미지: ${hints.imageCount}장 (원본 추정 ${hints.originalImageCount}장)
- 동영상: ${hints.videoCount}개
- 외부링크: ${hints.linkCount}개 / 내부링크: ${hints.internalLinkCount}개
- 표: ${hints.tableCount}개 / 리스트항목: ${hints.listItemCount}개 / 인용문: ${hints.quotationCount}개
- 소제목: ${hints.headingCount}개
- 1인칭/경험 표현 등장 횟수: ${hints.personalPronounCount}회
- FAQ 패턴 감지: ${hints.faqDetected ? '있음' : '없음'}

채점 대상 블로그 글:
${wrapUntrusted(`제목: ${title}\n\n본문:\n${text}`, 'naver_blog')}`,
    }],
  });

  const rawText = message.content[0]?.type === 'text' ? message.content[0].text : '';
  return parseJsonObjectFromClaudeText<NaverAiQualityEvaluation>(rawText);
}
