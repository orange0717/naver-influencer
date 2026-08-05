import { redirect } from 'next/navigation';

// 2026-08-05: '리스트(토픽)' 메뉴는 '리스트(유료)'(/influencers) 내 '토픽' 탭으로 통합됨
export default function DiscoverInfluencersPage() {
  redirect('/influencers?tab=topic');
}
