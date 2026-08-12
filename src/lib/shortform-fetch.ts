/**
 * 숏폼(인스타 릴스 / 유튜브 쇼츠) 원본 수집 — Manus 에이전트가 URL을 직접 열람(시청)해서
 * 대본·화면자막·캡션·해시태그·화면에서 읽은 지표를 텍스트로 뽑아온다.
 * 기획: docs/multiplatform-content-analysis-vision.md (Phase 4, Manus 경로)
 *
 * 인스타그램은 공식 Graph API로 임의 계정 인사이트를 못 가져오고, 유튜브 쇼츠도 자막이
 * 없는 경우가 많다. 그래서 두 플랫폼 모두 유튜브 STT 폴백과 같은 메커니즘(Manus 브라우징)으로
 * 통일해 처리한다. 화면에서 읽은 좋아요/댓글수 등은 공식 API 실측이 아니라 "Manus가 확인한
 * 시점 기준"이라는 점을 UI에 명시해야 한다.
 */
import { runManusTask, ManusUnavailableError } from './manus-client';

export { ManusUnavailableError };

export type ShortformPlatform = 'instagram_reel' | 'youtube';

export interface ShortformSource {
  platform: ShortformPlatform;
  canonicalUrl: string;
  /** 대본(내레이션/음성) — 없으면 빈 문자열 */
  transcript: string;
  /** 영상 위에 얹힌 화면 자막/텍스트 오버레이 */
  onScreenText: string;
  /** 게시물 캡션(본문) */
  caption: string;
  /** 해시태그 목록(# 제외한 순수 문자열) */
  hashtags: string[];
  /** 화면에서 읽은 지표 — 공식 API 실측 아님. 못 읽으면 null */
  metrics: {
    viewCount: number | null;
    likeCount: number | null;
    commentCount: number | null;
  };
  /** 오프닝(첫 1~3초) 후킹 요소에 대한 에이전트 서술 */
  hookDescription: string;
  /** 초 단위 흐름 구성에 대한 에이전트 서술 */
  structureNote: string;
  /** 에이전트가 접근/열람에 실패했거나 일부만 본 경우의 경고(로그인 월 등). 없으면 빈 문자열 */
  accessNote: string;
  /** 파싱에 사용한 Manus 원본 응답(디버깅/이력 보관용) */
  rawResponse: string;
}

const IG_REEL_RE = /instagram\.com\/(?:reel|reels|p)\/([A-Za-z0-9_-]+)/i;
const YT_SHORTS_RE = /youtube\.com\/shorts\/([A-Za-z0-9_-]{11})/i;
const YT_WATCH_RE = /(?:youtube\.com\/watch\?[^\s]*v=|youtu\.be\/)([A-Za-z0-9_-]{11})/i;

export interface DetectedShortform {
  platform: ShortformPlatform;
  canonicalUrl: string;
  externalId: string;
}

/** URL을 보고 플랫폼과 정규화 URL·외부 ID를 판별한다. 지원 대상이 아니면 null. */
export function detectShortform(rawUrl: string): DetectedShortform | null {
  const url = rawUrl.trim();

  const ig = url.match(IG_REEL_RE);
  if (ig) {
    return {
      platform: 'instagram_reel',
      canonicalUrl: `https://www.instagram.com/reel/${ig[1]}/`,
      externalId: ig[1],
    };
  }

  const shorts = url.match(YT_SHORTS_RE);
  if (shorts) {
    return {
      platform: 'youtube',
      canonicalUrl: `https://www.youtube.com/shorts/${shorts[1]}`,
      externalId: shorts[1],
    };
  }

  // 일반 watch/youtu.be URL도 쇼츠 분석 입력으로 허용(짧은 영상이면 동일하게 분석 가능)
  const watch = url.match(YT_WATCH_RE);
  if (watch) {
    return {
      platform: 'youtube',
      canonicalUrl: `https://www.youtube.com/shorts/${watch[1]}`,
      externalId: watch[1],
    };
  }

  return null;
}

// 파싱 안정성을 위해 흔한 문자와 겹치지 않는 고유 구분자를 쓰고, 에이전트에게 이 형식을 그대로
// 지키게 요청한다. 값이 없으면 "없음"으로 답하도록 유도해 누락과 실패를 구분한다.
const SECTIONS = {
  transcript: '@@대본@@',
  onScreen: '@@화면자막@@',
  caption: '@@캡션@@',
  hashtags: '@@해시태그@@',
  views: '@@조회수@@',
  likes: '@@좋아요@@',
  comments: '@@댓글수@@',
  hook: '@@후킹@@',
  structure: '@@구성@@',
  access: '@@접근메모@@',
} as const;

function buildPrompt(platform: ShortformPlatform, canonicalUrl: string): string {
  const platformName = platform === 'instagram_reel' ? '인스타그램 릴스' : '유튜브 쇼츠';
  return [
    `아래 ${platformName} 영상을 실제로 열어서 처음부터 끝까지 보고 들은 뒤, 콘텐츠를 분석할 수 있도록 정보를 정리해줘.`,
    `URL: ${canonicalUrl}`,
    '',
    '다음 항목을 각각 아래 구분자 형식 그대로, 순서대로 한 번만 작성해줘. 진행 상황 안내나 서론 없이 결과만 응답해.',
    `값을 확인할 수 없는 항목은 그 줄에 "없음"이라고만 써. 지표 숫자는 화면에 보이는 그대로(예: 1.2만, 12,345) 적어줘.`,
    '',
    `${SECTIONS.transcript}`,
    '영상에서 말하는 내레이션/음성을 한국어 대본으로. 화자가 여럿이면 구분하고, 자연스러운 문단으로.',
    '',
    `${SECTIONS.onScreen}`,
    '영상 화면 위에 얹힌 자막/텍스트 오버레이를 등장 순서대로.',
    '',
    `${SECTIONS.caption}`,
    '게시물 캡션(본문 글).',
    '',
    `${SECTIONS.hashtags}`,
    '해시태그를 쉼표로 구분(예: 여행, 브이로그, 제주도). # 기호는 빼고.',
    '',
    `${SECTIONS.views}`,
    '화면에 표시된 조회수.',
    '',
    `${SECTIONS.likes}`,
    '화면에 표시된 좋아요 수.',
    '',
    `${SECTIONS.comments}`,
    '화면에 표시된 댓글 수.',
    '',
    `${SECTIONS.hook}`,
    '오프닝(첫 1~3초)에서 시청자를 붙잡기 위해 쓴 요소를 1~2문장으로.',
    '',
    `${SECTIONS.structure}`,
    '초 단위 흐름 구성(도입→전개→마무리 등)을 2~3문장으로.',
    '',
    `${SECTIONS.access}`,
    '로그인 요구·연령 제한·비공개 등으로 일부라도 못 본 부분이 있으면 여기 적어. 문제없이 다 봤으면 "없음".',
  ].join('\n');
}

/** "@@섹션@@" 다음부터 다음 "@@...@@" 전까지의 본문을 잘라낸다. */
function extractSection(text: string, marker: string): string {
  const start = text.indexOf(marker);
  if (start === -1) return '';
  const after = start + marker.length;
  const nextMarker = text.slice(after).search(/@@[^@]+@@/);
  const end = nextMarker === -1 ? text.length : after + nextMarker;
  return text.slice(after, end).trim();
}

function isEmptyValue(v: string): boolean {
  const t = v.trim();
  return !t || t === '없음' || t === '-' || /^없(음|다)/.test(t);
}

/** "1.2만", "12,345", "3.4K", "1.1M" 같은 화면 표기를 숫자로. 못 읽으면 null. */
function parseCount(raw: string): number | null {
  if (isEmptyValue(raw)) return null;
  const s = raw.trim().replace(/,/g, '').replace(/\s+/g, '');
  const m = s.match(/([0-9]+(?:\.[0-9]+)?)\s*(만|억|천|k|m|b)?/i);
  if (!m) return null;
  const n = parseFloat(m[1]);
  if (Number.isNaN(n)) return null;
  const unit = (m[2] || '').toLowerCase();
  const mult =
    unit === '억' ? 100_000_000 :
    unit === '만' ? 10_000 :
    unit === '천' ? 1_000 :
    unit === 'k' ? 1_000 :
    unit === 'm' ? 1_000_000 :
    unit === 'b' ? 1_000_000_000 :
    1;
  return Math.round(n * mult);
}

function parseHashtags(raw: string): string[] {
  if (isEmptyValue(raw)) return [];
  return Array.from(
    new Set(
      raw
        .split(/[,\n#]/)
        .map((t) => t.trim().replace(/^#/, ''))
        .filter((t) => t.length > 0 && t !== '없음'),
    ),
  ).slice(0, 30);
}

function cleanText(raw: string): string {
  return isEmptyValue(raw) ? '' : raw.trim();
}

/**
 * Manus로 숏폼을 열람·분석해 구조화된 원본을 수집한다.
 *
 * @throws {ManusUnavailableError} MANUS_API_KEY 미설정
 * @throws {Error} Manus 태스크 실패/타임아웃
 */
export async function fetchShortformSource(detected: DetectedShortform): Promise<ShortformSource> {
  const prompt = buildPrompt(detected.platform, detected.canonicalUrl);
  const raw = await runManusTask(prompt, { maxWaitMs: 4 * 60 * 1000 });

  return {
    platform: detected.platform,
    canonicalUrl: detected.canonicalUrl,
    transcript: cleanText(extractSection(raw, SECTIONS.transcript)).slice(0, 12000),
    onScreenText: cleanText(extractSection(raw, SECTIONS.onScreen)).slice(0, 4000),
    caption: cleanText(extractSection(raw, SECTIONS.caption)).slice(0, 4000),
    hashtags: parseHashtags(extractSection(raw, SECTIONS.hashtags)),
    metrics: {
      viewCount: parseCount(extractSection(raw, SECTIONS.views)),
      likeCount: parseCount(extractSection(raw, SECTIONS.likes)),
      commentCount: parseCount(extractSection(raw, SECTIONS.comments)),
    },
    hookDescription: cleanText(extractSection(raw, SECTIONS.hook)),
    structureNote: cleanText(extractSection(raw, SECTIONS.structure)),
    accessNote: cleanText(extractSection(raw, SECTIONS.access)),
    rawResponse: raw.slice(0, 20000),
  };
}
