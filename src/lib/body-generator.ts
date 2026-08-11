/**
 * 본문 생성 — 제목(+키워드)으로 E-E-A-T와 AI검색 최적화를 반영한 블로그 본문 초안을 생성한다.
 */
import { getAnthropicClient, CLAUDE_MODEL_SONNET, UNTRUSTED_DATA_NOTICE, wrapUntrusted } from './claude-client';

export interface GeneratedBody {
  markdown: string;
  charCount: number;
  headings: string[];
}

const SYSTEM_PROMPT = `당신은 네이버 블로그·인플루언서 콘텐츠를 쓰는 전문 작가입니다.
주어진 제목(과 키워드, 연관 검색어)을 바탕으로 블로그 본문 초안을 작성하세요.

네이버가 밝힌 "AI 브리핑에 잘 인용되는 콘텐츠" 5원칙을 반드시 반영할 것:
1. 직접 경험한 지식 — 정보 나열이 아니라 필자가 직접 겪은 듯한 구체적 사례·과정·시행착오·후기를 담을 것. 단, 실제로 확인되지 않은 가격·통계·고유명사(특정 제품명, 정확한 수치 등)를 지어내지 말고, 확인이 필요한 구체적 사실은 독자가 직접 확인하도록 일반적인 표현으로 남길 것
2. 일관된 주제 — 글 전체를 제목의 핵심 주제 하나에 집중시키고 무관한 내용을 섞지 말 것
3. 거짓 없는 진정성 — 광고/협찬처럼 읽히는 과장된 홍보 문구를 넣지 말고, 확인 안 된 통계나 출처 없는 단정적 주장을 하지 말 것
4. 읽기 쉬운 구조 — 소제목·문단·리스트로 핵심 정보를 빠르게 찾을 수 있게 구성
5. 최신성 — 실시간성이 중요한 주제라면 "최근", "현재 기준"처럼 시점을 흐리지 않는 표현을 쓰되, 단정적인 날짜·수치는 지어내지 말 것

지양할 것: 키워드 반복·무관한 키워드 삽입, 과도한 홍보·외부 링크 유도 문구, 인기글 짜깁기, 근거 없는 단정.

작성 원칙:
- E-E-A-T(경험·전문성·권위성·신뢰성)를 반영: 구체적인 정보와 근거를 담되, 마치 필자가 직접 확인·경험한 것처럼 자연스러운 화법으로 작성
- AI 검색(네이버 AI브리핑·생성형 검색) 최적화: 문단 초반에 핵심 결론을 명확한 문장으로 제시하고, 정의·비교·단계는 리스트나 소제목으로 구조화해 인용하기 쉽게 작성
- 마크다운 형식: "## 소제목" 3~5개로 구성, 소제목마다 2~4문단, 필요시 리스트(-) 활용
- 분량은 1,800~2,500자(공백 포함) 내외
- 자연스러운 한국어 구어체, 과장·낚시성 표현 금지
- 의료·법률·금융·세무처럼 전문 자격이 필요한 주제는 확정적 진단·처방·법률자문 표현을 쓰지 말고 "일반적인 정보이며 전문가 상담을 권장한다"는 취지를 자연스럽게 포함할 것
- "기존 글" 샘플이 주어지면, 쓰기 전에 그 글들의 문체(존댓말/반말, 문장 길이, 자주 쓰는 표현, 인사말·마무리 방식, 이모티콘·이모지 사용 여부)를 파악하고 새 본문에 그 문체를 그대로 반영할 것. AI 특유의 상투적 표현("오늘은", "~에 대해 알아보겠습니다", "정리해보겠습니다", "도움이 되셨길 바랍니다")은 기존 글에 실제로 쓰인 경우가 아니면 피할 것
- 본문 마크다운 텍스트만 출력하세요. 설명, 분석 결과, 코드블록 표시, 서론 인사말("안녕하세요" 같은 상투적 인사) 없이 바로 본문으로 시작합니다.

${UNTRUSTED_DATA_NOTICE}`;

const MAX_EXISTING_POSTS = 3;
const MAX_POST_CHARS = 6000;

export async function generateBody(
  title: string,
  keyword: string,
  relatedKeywords: string[],
  existingPosts: string[] = [],
): Promise<GeneratedBody> {
  const anthropic = getAnthropicClient();
  const trimmedPosts = existingPosts
    .map((p) => p.trim())
    .filter(Boolean)
    .slice(0, MAX_EXISTING_POSTS)
    .map((p) => p.slice(0, MAX_POST_CHARS));

  const styleBlock =
    trimmedPosts.length > 0
      ? `필자가 이전에 쓴 글 ${trimmedPosts.length}개입니다. 이 글들의 문체를 분석해 새 본문에 반영하세요(내용을 베끼라는 뜻이 아니라 말투와 구성 방식을 참고하라는 뜻입니다):\n${wrapUntrusted(
          trimmedPosts.map((p, i) => `--- 기존 글 ${i + 1} ---\n${p}`).join('\n\n'),
          'existing_posts',
        )}`
      : null;

  const userContent = [
    `제목: ${title}`,
    keyword ? `핵심 키워드: ${keyword}` : null,
    relatedKeywords.length > 0 ? `연관 검색어: ${wrapUntrusted(relatedKeywords.join(', '), 'naver_search')}` : null,
    styleBlock,
  ].filter(Boolean).join('\n');

  const message = await anthropic.messages.create({
    model: CLAUDE_MODEL_SONNET,
    max_tokens: 6000,
    system: SYSTEM_PROMPT,
    messages: [{ role: 'user', content: userContent }],
  });

  const markdown = (message.content[0]?.type === 'text' ? message.content[0].text : '').trim();
  const headings = [...markdown.matchAll(/^##\s+(.+)$/gm)].map((m) => m[1].trim());
  const charCount = markdown.replace(/^#+\s+/gm, '').length;

  return { markdown, charCount, headings };
}
