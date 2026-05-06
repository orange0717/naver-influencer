import { redirect } from 'next/navigation';

export const dynamic = 'force-dynamic';

// 2026-05-06: /keywords/blogger 와 같은 API(/api/search-volume)를 사용하지만
// UI가 더 풍부한(정렬·저장 키워드) /keywords/blogger 로 통합. 외부 링크 호환을 위해 redirect 유지.
export default function SearchVolumeRedirectPage() {
  redirect('/keywords/blogger');
}
