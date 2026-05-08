import { redirect } from 'next/navigation';

export const dynamic = 'force-dynamic';

// 캠페인 = 개발 중 (메모리 정책: 카탈로그/구독에서 비공개, 다음 개발 시 부활 예정).
// 직접 URL 진입 차단. 부활 시 이 layout 파일만 삭제하면 복구됨.
export default function CampaignsLayout() {
  redirect('/');
}
