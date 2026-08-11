/**
 * 유튜브 영상 "콘텐츠 DNA" 분석 — 자막/대본 텍스트를 Claude에 넘겨 주제·톤·챕터·점수를 뽑아낸다.
 * 기획: docs/multiplatform-content-analysis-vision.md (Phase 1)
 *
 * 주의: 이 분석은 자막 텍스트만으로 하는 "AI 추정"이다. 실제 시청 유지율 데이터가 아니므로
 * dropOffRisk는 참고용으로만 표시해야 한다 (YouTube Analytics API는 채널 소유자 본인만 접근 가능).
 */
import { getAnthropicClient, CLAUDE_MODEL_SONNET, parseJsonObjectFromClaudeText, UNTRUSTED_DATA_NOTICE, wrapUntrusted } from './claude-client';

export interface ContentChapter {
  time: string; // "MM:SS" 또는 "H:MM:SS"
  label: string;
}

export interface YoutubeContentAnalysis {
  topic: string;
  contentType: string;
  tone: string;
  hookScore: number;
  infoScore: number;
  readabilityScore: number;
  ctaScore: number;
  chapters: ContentChapter[];
  dropOffRiskNote: string; // 이탈 위험 구간에 대한 AI 추정 설명 (실측 아님)
  recurringThemes: string[];
}

const SYSTEM_PROMPT = `당신은 유튜브 콘텐츠를 분석하는 전문가입니다.
주어진 영상 제목/설명과 자막(타임스탬프 포함)을 바탕으로 콘텐츠 구조와 품질을 분석하세요.

분석 항목:
- topic: 이 영상의 핵심 주제 (예: "자기계발/독서")
- contentType: 콘텐츠 유형 (예: "정보 전달형", "브이로그형", "리뷰형", "튜토리얼형")
- tone: 톤앤매너 (예: "차분함+전문성", "유머러스", "감성적")
- hookScore/infoScore/readabilityScore/ctaScore: 0~10점(소수 1자리), 각각 후킹 강도/정보 전달력/
  가독성(구조화 정도)/CTA(행동 유도) 강도를 평가
- chapters: 자막 타임스탬프를 참고해 영상을 5~8개 구간으로 나누고 각 구간의 역할을 라벨링
  (예: 후킹, 문제 제시, 핵심 내용, 사례, 해결 방법, 정리, CTA 등 상황에 맞게)
- dropOffRiskNote: 자막 흐름상 시청자가 지루해하거나 이탈할 가능성이 있어 보이는 구간과 이유를
  1~2문장으로 설명. **이것은 실제 시청 유지율 데이터가 아니라 텍스트 구조만으로 한 추정**이라는
  점을 스스로 인지하고, 확정적으로 단언하지 말고 "~일 가능성이 있다" 톤으로 작성
- recurringThemes: 영상 전체에서 반복적으로 등장하는 주제/키워드 2~5개

자막이 매우 짧거나 없는 경우, 제목/설명만으로 최선을 다해 추정하되 chapters는 빈 배열로 반환.

아래 JSON 스키마로만 응답하세요. 마크다운, 코드블록, 설명 문구 없이 순수 JSON만 반환합니다:
{"topic":"...","contentType":"...","tone":"...","hookScore":0,"infoScore":0,"readabilityScore":0,"ctaScore":0,"chapters":[{"time":"00:00","label":"..."}],"dropOffRiskNote":"...","recurringThemes":["..."]}

${UNTRUSTED_DATA_NOTICE}`;

const MAX_TRANSCRIPT_CHARS = 12000;

export async function analyzeYoutubeContent(params: {
  title: string;
  description: string;
  transcriptPromptText: string; // "[MM:SS] 텍스트" 형태, 없으면 빈 문자열
}): Promise<YoutubeContentAnalysis> {
  const anthropic = getAnthropicClient();

  const externalBlock = [
    `제목: ${params.title}`,
    params.description ? `설명: ${params.description.slice(0, 1000)}` : null,
    params.transcriptPromptText
      ? `\n자막(타임스탬프 포함, 최대 ${MAX_TRANSCRIPT_CHARS}자):\n${params.transcriptPromptText.slice(0, MAX_TRANSCRIPT_CHARS)}`
      : null,
  ].filter(Boolean).join('\n');

  const userContent = params.transcriptPromptText
    ? `분석 대상 유튜브 영상 데이터:\n${wrapUntrusted(externalBlock, 'youtube')}`
    : `분석 대상 유튜브 영상 데이터:\n${wrapUntrusted(externalBlock, 'youtube')}\n\n자막을 가져오지 못했습니다. 제목/설명만으로 분석하세요.`;

  const message = await anthropic.messages.create({
    model: CLAUDE_MODEL_SONNET,
    max_tokens: 4096,
    system: SYSTEM_PROMPT,
    messages: [{ role: 'user', content: userContent }],
  });

  const rawText = message.content[0]?.type === 'text' ? message.content[0].text : '';
  const parsed = parseJsonObjectFromClaudeText<Partial<YoutubeContentAnalysis>>(rawText);

  const clampScore = (v: unknown) => Math.max(0, Math.min(10, Math.round((Number(v) || 0) * 10) / 10));

  const chapters = Array.isArray(parsed.chapters)
    ? parsed.chapters
        .filter(
          (c): c is ContentChapter =>
            typeof c === 'object' && c !== null && typeof (c as ContentChapter).time === 'string' && typeof (c as ContentChapter).label === 'string',
        )
        .map((c) => ({ time: c.time.trim(), label: c.label.trim() }))
        .filter((c) => c.time && c.label)
    : [];

  const recurringThemes = Array.isArray(parsed.recurringThemes)
    ? parsed.recurringThemes.filter((t): t is string => typeof t === 'string' && t.trim().length > 0).map((t) => t.trim())
    : [];

  return {
    topic: typeof parsed.topic === 'string' ? parsed.topic.trim() : '',
    contentType: typeof parsed.contentType === 'string' ? parsed.contentType.trim() : '',
    tone: typeof parsed.tone === 'string' ? parsed.tone.trim() : '',
    hookScore: clampScore(parsed.hookScore),
    infoScore: clampScore(parsed.infoScore),
    readabilityScore: clampScore(parsed.readabilityScore),
    ctaScore: clampScore(parsed.ctaScore),
    chapters,
    dropOffRiskNote: typeof parsed.dropOffRiskNote === 'string' ? parsed.dropOffRiskNote.trim() : '',
    recurringThemes,
  };
}
