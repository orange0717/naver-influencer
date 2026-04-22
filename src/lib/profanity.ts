/**
 * 비속어/욕설 필터
 *
 * 전략:
 *  - 기본 단어 사전 + 우회 패턴(공백/특수문자/숫자 치환) 감지
 *  - MILD: 치환(***) 허용, 메시지는 통과
 *  - SEVERE: 전송 거부 + 사용자 경고
 *
 * 오탐 최소화를 위해 단어 경계 매칭을 기본으로 하되,
 * 한글은 띄어쓰기 없이 붙는 특성상 substring 매칭도 병행한다.
 * 정교한 맥락 감지는 추후 Claude/Perspective API 로 보강 예정.
 */

// ─── 사전 ───
// MILD: 치환 대상 (일반 욕설)
const MILD_WORDS = [
  '씨발', '시발', '씨빨', '시빨', '씨바', '시바',
  '개새끼', '개새', '쌍놈', '쌍년', '쌍것',
  '좆', '좇', '존나', '졸라', '개같',
  '병신', '븅신', '븅딱', '등신', '뇌절',
  '지랄', '지럴', '닥쳐',
  '꺼져', '닥치', 'ㅅㅂ', 'ㅄ', 'ㅂㅅ', 'ㄱㅅㄲ',
  '미친놈', '미친년', '돌아이',
  'fuck', 'shit', 'bitch', 'asshole', 'dick',
];

// SEVERE: 전송 거부 대상 (심각한 욕설/혐오표현)
const SEVERE_WORDS = [
  '씹새끼', '씹새', '씨발새끼', '개씨발', '좆까', '좆나',
  '창녀', '창놈', '걸레년', '니애미', '니엄마', '느개비', '느그애비',
  '호모새끼', '게이새끼', '레즈새끼', '똥꼬충',
  '김치녀', '한남충', '된장녀',
  '장애새끼', '병신새끼',
];

// ─── 텍스트 정규화 ───
/**
 * 우회 패턴을 풀어서 검사용 문자열로 변환:
 *  - 특수문자, 숫자(0→o, 1→i 등은 선택적), 공백 제거
 *  - 영어 소문자화
 */
function normalizeForCheck(text: string): string {
  return text
    .toLowerCase()
    // 공백 및 구분자 제거 (ㅅ ㅂ, 씨.발, 씨*발 등 우회 차단)
    .replace(/[\s.,!?~@#$%^&*()\-_+=|[\]{}/\\:;"'<>`]/g, '')
    // 숫자 일부 치환 (시8 → 시바 형태 감지)
    .replace(/8/g, '발')
    .replace(/18/g, '씨발');
}

/**
 * 메시지에서 비속어 검출
 *
 * @returns
 *   - severity: 'none' | 'mild' | 'severe'
 *   - cleaned: 치환된 메시지 (severity='mild' 일 때만 유효)
 *   - matched: 감지된 단어 목록
 */
export function detectProfanity(content: string): {
  severity: 'none' | 'mild' | 'severe';
  cleaned: string;
  matched: string[];
} {
  const normalized = normalizeForCheck(content);
  const matched: string[] = [];

  // SEVERE 먼저 검사
  for (const word of SEVERE_WORDS) {
    const n = normalizeForCheck(word);
    if (n && normalized.includes(n)) {
      matched.push(word);
    }
  }

  if (matched.length > 0) {
    return { severity: 'severe', cleaned: content, matched };
  }

  // MILD 검사 + 치환
  let cleaned = content;
  for (const word of MILD_WORDS) {
    const n = normalizeForCheck(word);
    if (!n) continue;
    if (normalized.includes(n)) {
      matched.push(word);
      // 원문에서 등장하는 동일 단어를 치환 (공백 허용 안 하는 단순 치환)
      // 더 정교한 마스킹은 복잡하므로 1차 구현은 원본 단어 기준
      const escaped = word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const regex = new RegExp(escaped, 'gi');
      cleaned = cleaned.replace(regex, '*'.repeat(Math.min(word.length, 3)));
    }
  }

  if (matched.length > 0) {
    return { severity: 'mild', cleaned, matched };
  }

  return { severity: 'none', cleaned: content, matched: [] };
}
