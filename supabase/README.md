# supabase/ 마이그레이션 폴더 안내

## ⚠️ 폴더가 두 곳으로 나뉜 이유 (2026-07-31 코드리뷰에서 발견)

`supabase/`와 `supabase/migrations/` 두 폴더에 마이그레이션 파일이 나뉘어 있습니다.
서로 다른 세션/작업에서 "다음 번호"를 각자 계산하다가 **같은 번호를 서로 다른 내용으로 중복 사용**한
이력이 있습니다 (예: `migration-085`가 두 폴더에 각각 다른 기능으로 존재).

git log 기준으로 둘 다 실제 커밋되어 병합된 것으로 보이며, 파일 내용이 서로 다른 기능이라
**둘 다 정상적으로 적용되었을 가능성이 높습니다** — 다만 파일명만으로는 실제 DB 적용 여부를
100% 확정할 수 없으므로, 아래 번호들은 Supabase 콘솔에서 실제 테이블/컬럼 존재 여부를
대조 확인하는 것을 권장합니다.

### 번호 충돌 목록 (2026-07-31 기준)

| 번호 | `supabase/` | `supabase/migrations/` |
|---|---|---|
| 085 | atomic-ranking-upsert | follow-relations |
| 086 | tool-anon-quota | page-verification |
| 087 | saved-keyword-ranks | users-is-admin |
| 088 | trial-users | users-naver-url-id |
| 098 | youtube-stt-history | restricted-users |

(097번은 두 폴더에 **완전히 동일한** 파일이 중복 존재해 `supabase/migrations/` 쪽 사본을
2026-07-31 코드리뷰에서 삭제했습니다 — 실제 충돌 아님.)

## 앞으로의 규칙

1. **새 마이그레이션은 `supabase/` 폴더 하나에만 작성합니다.** (`supabase/migrations/`는 신규 파일 추가 금지 — 히스토리 보존용으로만 유지)
2. 번호 대신 **`migration-YYYYMMDD-설명.sql`** (예: `migration-20260731-rls-hardening.sql`) 형식을 사용해 병렬 작업 시 번호 충돌을 원천 차단합니다.
3. 마이그레이션 SQL은 작성 후 Supabase 콘솔 SQL Editor에서 수동 실행 → 실행 여부를 커밋 메시지나 메모리에 기록해 "파일은 있는데 DB엔 미적용" 드리프트를 방지합니다 (이 프로젝트에서 반복된 패턴).
