/* 분석 화면이 공유하는 값 상수.
   공용 컴포넌트가 화면별 helpers 파일을 거꾸로 import 하지 않도록 여기에 둔다. */

// 서버(keyword-ranking-state PUT)는 포스팅당 20개까지만 저장하고 초과분은 잘라낸 뒤
// "목록에 없는 키워드"로 간주해 삭제한다 → 클라이언트에서 미리 막아 자동추출분 유실을 방지한다.
export const MAX_KEYWORDS_PER_POST = 20;
