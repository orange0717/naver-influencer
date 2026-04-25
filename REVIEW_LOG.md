# 코드리뷰 로그 — N인플

> 매일 누적 기록. "발견 없음" 도 기록해 패턴이 보이도록 한다.
> 양식: 변경 / 발견 / 다음 주목.

## 템플릿
```
## YYYY-MM-DD
- 변경: 무엇을 수정·추가했는가
- 발견: 새 이슈 있으면 file:line + 한 줄 요약, 없으면 "0건"
- 다음 주목: 내일 또는 다음 세션에서 살펴볼 영역
```

---

## 2026-04-25
- 변경: NicknameRequiredModal a11y, /notice/like RPC 에러 체크, /notices/poll/vote 응답 통일, users.email 인덱스, polite-crawler Retry-After, wrangler compatibility_date, 크론 4개 maxDuration, payment_transactions INSERT 감지, Sentry user identity, Vercel Speed Insights, CI 워크플로
- 발견: 0건 (8회 누적 리뷰로 충분히 정리됨)
- 다음 주목: Speed Insights 데이터 1주일 후 LCP/INP 추세 확인

---

## 요일별 리뷰 테마 (권장)
- 월: 보안 (RLS·인증·인가)
- 화: 성능 (쿼리·번들·N+1)
- 수: UX·접근성
- 목: 비즈니스 로직·결제
- 금: 데이터 모델·마이그레이션
- 주말: 변경분 회귀 스캔
