# 쿠키 기반 신원(naver_id/blog_id/user_type) 서명 도입 계획

> 2026-07-31 전체 코드리뷰에서 발견. **이번 세션에서는 구현하지 않기로 결정**(오렌지 확인) —
> 로그인 핵심 로직이라 별도 세션에서 충분히 테스트하며 진행할 것. 이 문서는 다음 세션이
> 바로 착수할 수 있도록 원인·영향범위·구현 옵션을 정리한 계획서.

## 1. 문제 요약

`src/lib/auth.ts`의 `getCookieUser()`는 **데모/체험(비회원) 사용자**를 식별하는 함수로,
`user_type`/`naver_id`/`blog_id` 쿠키 값을 그대로 신원으로 신뢰한다. 이 쿠키들은 `httpOnly`이지만
**서명(HMAC/JWT)이 없는 평문 값**이라, httpOnly는 JS(`document.cookie`) 접근만 막을 뿐
조작된 HTTP 요청(curl, 수정된 fetch 등)으로 임의 값을 보내는 것은 막지 못한다.

> ⚠️ 정식 로그인 회원(Supabase Auth 세션, `getAuthUser()`)은 이 문제와 **무관**하다.
> Supabase Auth의 JWT는 정상적으로 서명·검증되고 있음. 취약점은 **데모/체험 플로우**로 한정된다.

## 2. 확인된 구체적 익스플로잇 경로

### 2-1. `unified` 타입 — 검증 자체가 없음 (가장 심각, 우선순위 최상)
```ts
// src/lib/auth.ts
if (userType === 'unified' && naverId) {
  return { id: naverId, type: 'influencer' };  // DB 대조 없이 즉시 신원 부여
}
```
저장소 전체를 검색한 결과, `user_type` 쿠키에 **`'unified'`를 실제로 쓰는 서버 코드가 하나도 없다**
(`grep -rn "cookies.set('user_type'" src` → `'influencer'`/`'blogger'`만 존재). 즉 이 분기는
정상 플로우에서는 절대 도달하지 않는 **공격자 전용 진입점**이다. `Cookie: user_type=unified; naver_id=<임의값>`
만 보내면 `demo_sessions` 테이블 대조조차 없이 즉시 그 신원으로 인증된다.

**영향**: `src/app/api/chat/messages/[id]/route.ts`의 `DELETE`는 `cookieUser.id`(=위조된 naver_id)로
`users.id`를 조회해 `isAdmin(userRow.id)`를 판정한다. 공격자가 관리자의 naver_id(공개된 네이버
블로그/인플루언서 주소)를 알면, `user_type=unified` 쿠키만으로 **관리자 권한으로 임의 메시지 강제삭제**가
가능하다. 같은 `cookieUser.id`가 채팅 작성(`author_id`) 등 다른 곳에도 신원으로 쓰이므로 타인 행세
가능성도 있음 (전수 사용처 재검토 필요, 아래 5-3 참고).

### 2-2. `influencer` 타입 — 데모 세션 만료 체크가 있으나 값 자체는 위조 가능
`demo_sessions` 테이블에 `verified_at IS NOT NULL`인 행이 있어야 통과하는데, 이는 "이 naver_id로
데모를 신청한 사람이 있었는가"만 확인할 뿐 "지금 이 요청을 보낸 사람이 그 사람인가"는 확인하지
않는다 → 데모를 신청한 적 있는 타인의 naver_id를 쿠키에 넣으면 그 사람 행세 가능.

### 2-3. 데모/체험 게이트 우회 (과금 모델 우회)
- `middleware.ts`: `hasDemoSession`은 `demo_mode==='true' && naver_id 존재`만 확인, DB 대조 없음.
- `src/lib/trial.ts`의 `isTrialExpired()`는 `trial_started` 쿠키의 타임스탬프를 그대로 신뢰 →
  최신 타임스탬프로 재설정하면 7일 체험 만료를 영구 회피 가능.

## 3. 왜 지금 안 고치는가

- `getCookieUser()`는 최소 6개 이상 API 라우트(`chat/*`, `messages/*` 등)와 `middleware.ts`
  여러 분기에서 참조되어, 신원 표현 방식을 바꾸면 연쇄적으로 손봐야 할 지점이 많다.
- 잘못 배포하면 데모/체험 사용자 전체가 로그인 상태를 잃거나, 반대로 검증 로직이 과해져
  정상 사용자까지 차단될 위험이 있다.
- 라이브 유료 서비스라 배포 전 별도 세션에서 충분히 테스트가 필요하다는 것이 오렌지 판단.

## 4. 구현 옵션 (다음 세션에서 택 1)

| 옵션 | 방식 | 장점 | 단점 |
|---|---|---|---|
| A. HMAC 서명 쿠키 | `naver_id`/`blog_id` 값 뒤에 `HMAC-SHA256(value, SECRET)` 서명을 붙여 저장, 읽을 때 검증 | 변경 범위 작음(auth.ts만 손보면 됨), 기존 쿠키 구조 유지 | 쿠키를 발급한 서버만 검증 가능(SECRET 로테이션 시 기존 쿠키 전부 무효화됨 — 재로그인 유발) |
| B. 서버 세션 테이블 | 쿠키엔 랜덤 세션 토큰만 저장, `demo_sessions`(또는 신규 `guest_sessions`)에 토큰→naver_id 매핑 저장 후 매 요청마다 DB 조회 | 가장 안전(토큰 탈취돼도 즉시 DB에서 폐기 가능), 감사로그 용이 | DB 조회 1회 추가(이미 `demo_sessions` 조회는 하고 있어 증분 비용 적음) |
| C. Supabase Auth로 완전 전환 | 데모/체험도 Supabase Auth의 익명 로그인(anonymous sign-in) 사용 | 서명·만료·리프레시를 Supabase가 전부 관리, 자체 구현 불필요 | 가장 큰 리팩터링, 기존 데모 사용자 마이그레이션 필요 |

**권장**: B(서버 세션 테이블) — 이미 `demo_sessions` 테이블이 존재하고 `influencer` 타입 분기에서
비슷한 조회를 하고 있어 구현 범위가 가장 작고, 즉시 세션 폐기(악용 탐지 시 강제 로그아웃)가
쉬워 데모 어뷰징 대응에도 유리함.

## 5. 실행 시 체크리스트 (다음 세션용)

1. **선행 조치(위험 낮음, 먼저 해도 됨)**: `unified` 분기 자체를 제거하거나 최소한 `influencer`
   분기와 동일하게 `demo_sessions` 대조를 추가한다. legitimate 코드가 이 값을 쓰지 않으므로
   회귀 위험이 사실상 없다 — 별도 세션 시작하면 가장 먼저 처리 권장.
2. 옵션 B 선택 시: `demo_sessions`에 `session_token`(랜덤, UNIQUE) 컬럼 추가 → 쿠키엔 이 토큰만 저장.
3. `getCookieUser()`를 토큰→행 조회 방식으로 교체, `chat/*`, `messages/*` 등 소비처는 인터페이스
   동일하게 유지해 호출부 변경 최소화.
4. `trial_started` 쿠키도 같은 세션 테이블에 `trial_expires_at`으로 옮겨 서버 신뢰 기준으로 통일.
5. 배포 후 확인: 데모 신청 → 대시보드 진입 → 7일 후 만료 처리 전체 플로우를 스테이징에서
   먼저 검증. 기존에 발급된 미서명 쿠키를 가진 사용자는 재로그인/재신청 필요할 수 있음을
   공지 문구로 안내할지 결정.
6. `isAdmin()` 판정에 쓰이는 모든 사용자 식별자가 이 시점 이후로는 서명된/검증된 값에서만
   나오는지 전수 재확인 (5-3, `src/lib/admin.ts` 및 사용처 grep).

## 6. 관련 발견 (참고, Medium)

관리자 판정 로직 자체도 `isAdmin()`(환경변수 `ADMIN_USER_IDS`)만 보는 곳과 `users.is_admin`
DB 컬럼(source of truth로 문서화됨)을 보는 곳이 나뉘어 있음 — 이번 세션의 별도 작업(Task #5)에서
DB 컬럼도 함께 확인하도록 통일 처리함. 이 문서의 쿠키 서명 작업과는 독립적으로 진행 가능.
