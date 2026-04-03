/**
 * update-data.ts — 업데이트 공지 데이터
 *
 * 새 업데이트 추가 시:
 * 1. UPDATES 배열 맨 앞에 새 항목 추가
 * 2. version을 고유하게 설정 (localStorage dismiss 키로 사용)
 * 3. 배포하면 자동으로 새 배너 표시
 */

export interface UpdateItem {
  /** 고유 버전 키 (dismiss 상태 저장용) */
  version: string;
  /** 업데이트 날짜 (표시용) */
  date: string;
  /** 업데이트 요약 제목 */
  title: string;
  /** 변경 사항 목록 */
  changes: string[];
  /** 상세 페이지 링크 (선택) */
  href?: string;
}

/**
 * 최신 업데이트가 맨 위에 오도록 정렬
 * 첫 번째 항목만 배너로 표시됨
 */
export const UPDATES: UpdateItem[] = [
  {
    version: '2026-04-03b',
    date: '2026.04.03',
    title: '4월 3일 업데이트일정',
    changes: [
      '키워드챌린지 검색량·경쟁도 로직 고도화',
      '키워드 순위 변동 앱 알림 예정',
      '키워드챌린지 TOP 1-3위 표기',
    ],
    href: '/notice/45cf39e6-7378-4761-9dfd-ddc628e9e64a',
  },
  {
    version: '2026-03-29',
    date: '2026.03.29',
    title: 'N인플 업데이트 현황',
    changes: [
      '팬 수 전체 표기',
      '7일 무료 데모체험',
      '연도별 인플루언서 현황',
    ],
    href: '/notice/f424ae0f-6827-4d64-aa8b-737e519a8367',
  },
];

/** 현재 표시할 최신 업데이트 */
export function getLatestUpdate(): UpdateItem | null {
  return UPDATES[0] ?? null;
}
