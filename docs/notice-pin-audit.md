# 공지사항 상단 고정 조사 (Phase 0)

작성일: 2026-09-02 · 기준 커밋: `4e6f2008` · 코드 수정 없음

> **후속 (2026-09-02, 같은 날)**
> 아래 조사 후 오렌지 결정으로 두 차례 변경이 있었습니다. 이 문서 본문은 조사 시점 기록 그대로 두고, 최종 동작만 여기 적습니다.
> 1. `45d69e32` — 상단 배너 노출 해제(전역 렌더 제거) + 목록·상세 「고정」 배지 제거.
> 2. `HEAD` — **배너를 되살리되 "작성 후 3일간만 노출"로 변경.** `show_on_banner` 조건을 없애 새 공지는 전부 자동으로 3일 배너에 뜨고, 3일이 지나면 조회 시점 `created_at` 판정으로 자동으로 내려갑니다(크론·플래그 없음). 폴백(`src/lib/update-data.ts`)은 3일 만료 시 옛 배너가 대신 올라오는 문제 때문에 **파일째 삭제**했습니다.
> 결과적으로 `notices.show_on_banner` 컬럼은 **읽는 곳이 없어졌습니다**(§7의 수정 화면 토글은 무효). 목록의 `is_pinned` 우선 정렬은 여전히 남아 있으나 데이터가 전부 false 라 무해합니다.

---

## 0. 먼저 보고할 것 — 지시서 전제와 실제가 다른 점

### (1) 스택 전제 오류: Prisma ORM 없음

지시서 §1은 Prisma ORM을 전제하지만 이 저장소에는 `prisma/` 디렉터리도 `@prisma/client` 의존성도 없습니다.
데이터 접근은 전부 **Supabase JS 클라이언트(PostgREST)** 이며, 스키마는 `supabase/migration-*.sql` 원문입니다.
따라서 §3-2의 "Prisma 쿼리 위치", §3-3의 "Prisma 스키마 원문"은 각각 Supabase 쿼리 / SQL 마이그레이션 원문으로 대체해 기록했습니다.

### (2) 🚨 현재 프로덕션에 고정된 공지가 **한 건도 없습니다**

`is_pinned` 우선 정렬 코드는 존재하지만, 실제 데이터는 7건 전부 `is_pinned = false` 입니다.

```
$ curl -s 'https://ninfle.kr/api/notices?limit=50'
total 7 / returned 7 / totalPages 1
false  2026-08-17  모두의 창업 도전 안내
false  2026-04-29  도메인 변경 안내
false  2026-04-21  앱 출시관련
false  2026-04-11  N인플 개발 업데이트 (이름 변경예정)
false  2026-04-08  N인플 서비스 유료 전환 및 향후 운영 계획 안내
false  2026-04-02  4월 3일 업데이트일정
false  2026-03-29  N인플 업데이트 현황
```

즉 §4.1을 그대로 수행해 `is_pinned` 정렬을 제거해도 **화면에는 아무 변화가 없습니다.**
현재 목록 최상단의 「모두의 창업 도전 안내」는 고정된 것이 아니라 단순히 작성일이 가장 최신이라 위에 있는 것입니다.

### (3) 🚨 실제로 "최상단에 고정 노출" 중인 것은 별개 기능(`show_on_banner`)입니다

같은 공지 「모두의 창업 도전 안내」가 **전 페이지 상단 배너**로 고정 노출되고 있습니다.
`/notice` 화면에서도 이 배너가 목록 바로 위에 붙어 나오므로, 육안으로는 "공지 하나가 목록 맨 위에 고정된" 것처럼 보입니다.

```
$ curl -s 'https://ninfle.kr/api/notices/banner'
{"notice":{"id":"50053c7a-…","title":"모두의 창업 도전 안내","tag":"notice","date":"2026.08.17", … }}
```

- 컬럼: `notices.show_on_banner` (`is_pinned` 와 **다른 컬럼**)
- API: `src/app/api/notices/banner/route.ts` — `show_on_banner = true` 중 최신 1건
- 렌더: `src/components/UpdateBanner.tsx`, 전역 `src/app/layout.tsx:272` 에서 렌더
- 해제 방법: 해당 공지의 `show_on_banner` 를 false 로 (글 수정 화면에 토글 있음, 아래 §7)

**오렌지가 해제하려는 대상이 (2)인지 (3)인지 확정이 필요합니다.** §5에 미확정 7번으로 추가했습니다.

---

## 1. 화면 라우트와 렌더링 컴포넌트

| 구분 | 경로 |
|---|---|
| 목록 화면 | `src/app/notice/page.tsx` (클라이언트 컴포넌트, 전용 — 공유 컴포넌트 아님) |
| 목록 레이아웃 | `src/app/notice/layout.tsx` (메타데이터만) |
| 상세 화면 | `src/app/notice/[id]/page.tsx` |
| 작성 / 수정 | `src/app/notice/write/page.tsx`, `src/app/notice/[id]/edit/page.tsx` |

상단 네비 진입점: `src/lib/sidebar-nav.ts:130` (`{ label: '공지사항', href: '/notice' }`).
참고로 `/notice` 는 `src/lib/routes.ts:79` 기준 **회원 전용(private)** 경로입니다.

## 2. 목록 조회 API와 쿼리 위치

`src/app/api/notices/route.ts:33-39`

```ts
const { data: notices, error } = await supabase
  .from('notices')
  .select('id, title, tag, author_name, view_count, comment_count, like_count, is_pinned, created_at')
  .eq('is_deleted', false)
  .order('is_pinned', { ascending: false })   // ← 고정 우선 정렬 (37행)
  .order('created_at', { ascending: false })  // ← 2순위 (38행)
  .range(offset, offset + limit - 1);
```

## 3. 고정 필드의 실제 이름과 타입

컬럼명은 `is_pinned` 입니다 (`isPinned`·`priority`·`order` 아님).

`supabase/migration-019-notices.sql:15`
```sql
  is_pinned BOOLEAN NOT NULL DEFAULT FALSE,
```

`supabase/migration-019-notices.sql:34`
```sql
CREATE INDEX IF NOT EXISTS idx_notices_pinned_created ON notices (is_pinned DESC, created_at DESC);
```

프런트 타입 선언은 `src/app/notice/page.tsx:27`, `src/app/notice/[id]/page.tsx:31` 두 곳에 `is_pinned: boolean` 로 중복 선언돼 있습니다.

## 4. 고정 구현 방식 → **(a) 단일 쿼리의 orderBy 1순위**

- (a) 해당 — `route.ts:37`
- (b) 별도 쿼리·별도 섹션 렌더링: **없음**. 목록은 `notices.map()` 단일 배열 하나뿐 (`page.tsx:105`)
- (c) 클라이언트 재정렬: **없음**. 응답 배열을 그대로 `setNotices` (`page.tsx:57`)

따라서 지시서가 우려한 (b) 방식의 레이아웃 영향은 발생하지 않습니다.

## 5. 고정 이후 2순위 정렬 기준

`created_at` 내림차순 (작성일 최신순). 수정일·id 기준은 사용하지 않습니다.
`is_pinned` 정렬을 제거하면 `created_at desc` 단일 기준만 남습니다.

## 6. 목록의 고정 배지·라벨

있습니다. 문구는 「고정」입니다.

| 위치 | 조건 | 문구 |
|---|---|---|
| `src/app/notice/page.tsx:109-111` | `notice.is_pinned` 가 true | `고정` (accent 색 pill) |
| `src/app/notice/[id]/page.tsx:332-334` | 상세 화면에도 동일 배지 존재 | `고정` |

태그 배지(`공지`/`업데이트`/`이벤트`, `TAG_LABEL`)는 고정과 무관한 별개 표시입니다.

## 7. 관리자 화면의 고정 설정 UI → **존재하지 않습니다**

- `/admin` 하위에 공지 관리 화면 자체가 없습니다 (`src/app/admin/` 에 notice 관련 디렉터리 없음).
- 작성 화면 `notice/write`·수정 화면 `notice/[id]/edit` 에도 고정 체크박스가 없습니다.
- 생성 스키마 `src/lib/validations/notice.ts` 필드는 `title / content / tag / showOnBanner` 뿐 — **`isPinned` 를 받는 입력 경로가 없습니다.**
- PATCH 핸들러(`src/app/api/notices/[id]/route.ts:206`)도 `show_on_banner` 만 갱신합니다.

→ `is_pinned` 는 **UI로는 켤 수 없고 DB에서 직접 UPDATE 해야만 켜지는 사실상 사문화된 컬럼**입니다.
반면 배너 노출(`showOnBanner`)은 글 수정 화면에 토글이 있습니다(`edit/page.tsx:49`).

## 8. 다른 게시판과의 로직·컴포넌트 공유 → **공유하지 않습니다**

| 게시판 | 정렬 | 비고 |
|---|---|---|
| 공지사항 `/api/notices` | `is_pinned desc, created_at desc` | 이번 대상 |
| 커뮤니티 `/api/community:39-42` | `is_pinned desc, created_at desc` | **같은 패턴이지만 별도 파일에 복붙된 코드** — 공유 모듈 아님 |
| 성장후기 `/api/stories:34` | `created_at desc` | 고정 정렬 없음 |

커뮤니티는 코드를 공유하지 않으므로 §4.2의 "로직 공유 시 정지" 조건에는 **해당하지 않습니다**(공지만 고쳐도 커뮤니티는 안 건드려집니다).

다만 덧붙일 사실 하나: `/community` 화면은 현재 게시판이 아니라 **채팅방(`ChatRoom`)** 으로 바뀌어 있고, `/api/community` GET 을 호출하는 프런트가 한 곳도 없습니다(작성 POST만 남아 있음). 즉 커뮤니티의 `is_pinned` 정렬은 이미 죽은 코드입니다. 이번 범위 밖이라 손대지 않았습니다.

## 9. 페이지네이션 중복 노출 → **현재 발생하지 않습니다**

- API는 `page`/`limit` 를 받지만, 목록 화면은 `limit=50` 으로 **한 번만** 호출하고 페이지 이동 UI가 없습니다 (`page.tsx:54`).
- 총 공지가 7건이라 `totalPages: 1` — 실측상 중복 노출 없음.
- 구조상으로도 (b) 별도 쿼리 방식이 아니라 단일 `range()` 슬라이스라, 페이지가 늘어나도 고정 글이 매 페이지 반복되지는 않습니다.

---

## 10. Phase 1 예상 변경 (승인 전까지 미실행)

§5 미확정 1·2·7번이 확정돼야 확정 가능합니다. 미확정 7번이 "(2) `is_pinned`" 로 확정될 경우 최소 변경은:

| 파일 | 변경 |
|---|---|
| `src/app/api/notices/route.ts:37` | `.order('is_pinned', …)` 한 줄 제거 → `created_at desc` 단독 |
| `src/app/notice/page.tsx:109-111` | 「고정」 배지 — 미확정 2번 확정 후 결정 |

`.select()` 의 `is_pinned` 컬럼, DB 컬럼, 인덱스, 데이터 값은 §4.2에 따라 전부 그대로 둡니다.

---

## 11. 미확정 항목 (지시서 §5 + 조사 중 추가)

| # | 항목 | 상태 |
|---|---|---|
| 1 | 고정 해제 후 최종 정렬 기준 — 기존 2순위 `created_at desc` 승격이면 충분한지 | 미확정 |
| 2 | 목록·상세의 「고정」 배지를 함께 제거할지 | 미확정 |
| 3 | 관리자 고정 설정 UI 제거 여부 → **UI가 애초에 없어 해당 없음** | 해당 없음 |
| 4 | `is_pinned` 컬럼·인덱스 최종 존치 여부 (이번 범위는 존치) | 미확정 |
| 5 | 커뮤니티에도 동일 적용할지 → 코드 미공유·프런트 호출 없는 죽은 코드 | 미확정 |
| 6 | 목록 외 화면의 고정 우대 → **상세 화면 배지 1곳뿐**, 검색·사이트맵에는 우대 없음 | 확인 완료 |
| 7 | 🚨 **해제 대상이 `is_pinned` 인지, 실제로 상단 고정 중인 배너(`show_on_banner`)인지** | 미확정 |
