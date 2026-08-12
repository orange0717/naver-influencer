/**
 * 네이버 블로그 포스트 발행일(addDate) 파서 → epoch 밀리초(number) 반환.
 *
 * 네이버는 발행 시각을 두 가지로 내려준다:
 *   - 절대 날짜: "2026. 8. 11."  또는  "2026. 8. 11. 14:23"  (RSS 는 ISO 문자열)
 *   - 상대 시간: "방금 전", "3분 전", "22시간 전", "어제", "그제", "2일 전"  ← 최근 글(대략 하루 이내)
 *
 * 과거 파서는 절대 날짜/ISO 만 처리하고 상대 시간은 null 로 떨어뜨렸다.
 * 그 결과 "22시간 전"으로 표기되는 갓 발행된 글(= 미노출일 확률이 가장 높은 글)이
 * "최근 30일" 집계·색인유예 판정에서 통째로 빠졌다. 상대 시간까지 파싱해 이를 바로잡는다.
 *
 * 반환은 종전과 동일하게 number(epoch ms) | null — 기존 호출부(blog-quality, naver-topics)와 호환.
 */
export function parseNaverPostDate(raw?: string | null, now: number = Date.now()): number | null {
  if (!raw) return null;
  const s = String(raw).trim();
  if (!s) return null;

  // ── 상대 시간 ──────────────────────────────────────────────
  if (/방금|막\s*전/.test(s)) return now;

  const minAgo = s.match(/(\d+)\s*분\s*전/);
  if (minAgo) return now - Number(minAgo[1]) * 60 * 1000;

  const hourAgo = s.match(/(\d+)\s*시간\s*전/);
  if (hourAgo) return now - Number(hourAgo[1]) * 60 * 60 * 1000;

  const dayAgo = s.match(/(\d+)\s*일\s*전/);
  if (dayAgo) return now - Number(dayAgo[1]) * 24 * 60 * 60 * 1000;

  if (/그저께|그제/.test(s)) return now - 2 * 24 * 60 * 60 * 1000;
  if (/어제/.test(s)) return now - 24 * 60 * 60 * 1000;
  if (/오늘/.test(s)) return now;

  // ── 절대 날짜: "2026. 8. 11." (+ 선택적 "14:23") ─────────────
  const m = s.match(/(\d{4})\.\s*(\d{1,2})\.\s*(\d{1,2})\.?(?:\s+(\d{1,2}):(\d{2}))?/);
  if (m) {
    const [, y, mo, d, h, mi] = m;
    const t = new Date(Number(y), Number(mo) - 1, Number(d), Number(h || 0), Number(mi || 0)).getTime();
    return Number.isNaN(t) ? null : t;
  }

  // ── ISO / 기타 Date 파싱 가능 문자열 ────────────────────────
  const iso = Date.parse(s);
  return Number.isNaN(iso) ? null : iso;
}
