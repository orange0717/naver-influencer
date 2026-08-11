/**
 * 숏폼(릴스/쇼츠) "콘텐츠 DNA" 분석 — Manus가 수집한 대본·화면자막·캡션·해시태그를 Claude에 넘겨
 * 숏폼 특성(첫 3초 후킹, 시청 지속/루프, 저장 유발, CTA)에 맞춘 구조·품질 분석을 뽑아낸다.
 * 기획: docs/multiplatform-content-analysis-vision.md (Phase 4)
 *
 * 유튜브 롱폼 분석(youtube-content-analysis.ts)과 형제 관계지만, 숏폼은 지표 관점이 달라
 * (챕터 대신 초단위 비트, 이탈 대신 루프/지속) 별도 프롬프트·스키마를 쓴다.
 */
import { getAnthropicClient, CLAUDE_MODEL_SONNET, parseJsonObjectFromClaudeText } from './claude-client';
import type { ShortformPlatform, ShortformSource } from './shortform-fetch';

export interface ShortformBeat {
  time: string; // "0-3초", "0:03" 등
  label: string;
}

export interface ShortformContentAnalysis {
  topic: string;
  contentType: string; // 예: "정보형", "브이로그", "챌린지", "리뷰", "밈/유머"
  tone: string;
  hookScore: number; // 첫 3초 후킹 강도
  retentionScore: number; // 끝까지/반복 시청 유도(지속·루프) 강도 — AI 추정
  infoScore: number; // 정보 밀도/가치
  ctaScore: number; // 저장·팔로우·댓글 등 행동 유도 강도
  beats: ShortformBeat[]; // 초단위 흐름 분해
  hookAnalysis: string; // 오프닝 후킹에 대한 진단
  improvements: string[]; // 다음 숏폼을 위한 개선 제안 2~4개
  recurringThemes: string[];
}

const SYSTEM_PROMPT = `당신은 인스타그램 릴스와 유튜브 쇼츠 같은 숏폼 영상을 분석하는 전문가입니다.
주어진 대본, 화면 자막(오버레이 텍스트), 캡션, 해시태그, 에이전트가 관찰한 후킹/구성 설명을 바탕으로
숏폼 관점에서 콘텐츠 구조와 품질을 분석하세요. 숏폼은 롱폼과 달리 "첫 3초 후킹"과 "끝까지/반복 시청"이
성패를 가릅니다.

분석 항목:
- topic: 핵심 주제 (예: "제주 여행/카페")
- contentType: 숏폼 유형 (예: "정보형", "브이로그", "챌린지", "리뷰", "밈/유머", "튜토리얼")
- tone: 톤앤매너 (예: "빠른 편집+경쾌", "감성적", "정보 전달")
- hookScore: 첫 1~3초가 시청자를 붙잡는 힘 (0~10, 소수 1자리)
- retentionScore: 끝까지 보거나 다시 보게(루프) 만드는 힘 (0~10). **실측 시청 유지율이 아니라 구성·대본
  구조만으로 한 AI 추정**이므로 확정적으로 단언하지 말 것
- infoScore: 정보 밀도/가치 (0~10)
- ctaScore: 저장·팔로우·댓글·공유 등 행동 유도 강도 (0~10)
- beats: 영상을 3~6개의 초단위 흐름으로 나누고 각 구간 역할을 라벨링
  (예: {"time":"0-3초","label":"질문 던지기(후킹)"})
- hookAnalysis: 오프닝 후킹이 왜 효과적/비효과적인지 1~2문장 진단
- improvements: 다음 숏폼을 위한 구체적 개선 제안 2~4개
- recurringThemes: 반복 등장하는 주제/키워드 2~5개

정보가 매우 부족하면(대본·자막·캡션이 모두 비어 있으면) 가능한 범위에서 최선을 다해 추정하되,
beats는 빈 배열로 반환하세요.

아래 JSON 스키마로만 응답하세요. 마크다운, 코드블록, 설명 문구 없이 순수 JSON만 반환합니다:
{"topic":"...","contentType":"...","tone":"...","hookScore":0,"retentionScore":0,"infoScore":0,"ctaScore":0,"beats":[{"time":"0-3초","label":"..."}],"hookAnalysis":"...","improvements":["..."],"recurringThemes":["..."]}`;

export async function analyzeShortformContent(source: ShortformSource): Promise<ShortformContentAnalysis> {
  const anthropic = getAnthropicClient();

  const platformLabel: Record<ShortformPlatform, string> = {
    instagram_reel: '인스타그램 릴스',
    youtube: '유튜브 쇼츠',
  };

  const userContent = [
    `플랫폼: ${platformLabel[source.platform]}`,
    source.transcript ? `\n[대본]\n${source.transcript}` : '\n[대본] 없음',
    source.onScreenText ? `\n[화면 자막]\n${source.onScreenText}` : null,
    source.caption ? `\n[캡션]\n${source.caption}` : null,
    source.hashtags.length ? `\n[해시태그] ${source.hashtags.map((t) => `#${t}`).join(' ')}` : null,
    source.hookDescription ? `\n[관찰된 후킹] ${source.hookDescription}` : null,
    source.structureNote ? `\n[관찰된 구성] ${source.structureNote}` : null,
  ]
    .filter(Boolean)
    .join('\n');

  const message = await anthropic.messages.create({
    model: CLAUDE_MODEL_SONNET,
    max_tokens: 4096,
    system: SYSTEM_PROMPT,
    messages: [{ role: 'user', content: userContent }],
  });

  const rawText = message.content[0]?.type === 'text' ? message.content[0].text : '';
  const parsed = parseJsonObjectFromClaudeText<Partial<ShortformContentAnalysis>>(rawText);

  const clampScore = (v: unknown) => Math.max(0, Math.min(10, Math.round((Number(v) || 0) * 10) / 10));

  const beats = Array.isArray(parsed.beats)
    ? parsed.beats
        .filter(
          (b): b is ShortformBeat =>
            typeof b === 'object' &&
            b !== null &&
            typeof (b as ShortformBeat).time === 'string' &&
            typeof (b as ShortformBeat).label === 'string',
        )
        .map((b) => ({ time: b.time.trim(), label: b.label.trim() }))
        .filter((b) => b.time && b.label)
    : [];

  const toStringList = (v: unknown): string[] =>
    Array.isArray(v) ? v.filter((t): t is string => typeof t === 'string' && t.trim().length > 0).map((t) => t.trim()) : [];

  return {
    topic: typeof parsed.topic === 'string' ? parsed.topic.trim() : '',
    contentType: typeof parsed.contentType === 'string' ? parsed.contentType.trim() : '',
    tone: typeof parsed.tone === 'string' ? parsed.tone.trim() : '',
    hookScore: clampScore(parsed.hookScore),
    retentionScore: clampScore(parsed.retentionScore),
    infoScore: clampScore(parsed.infoScore),
    ctaScore: clampScore(parsed.ctaScore),
    beats,
    hookAnalysis: typeof parsed.hookAnalysis === 'string' ? parsed.hookAnalysis.trim() : '',
    improvements: toStringList(parsed.improvements),
    recurringThemes: toStringList(parsed.recurringThemes),
  };
}
