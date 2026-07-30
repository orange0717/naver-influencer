import { requireBloggerPlusPage } from '@/lib/plan-server-guards';
import DiscoverInfluencersView from '@/components/DiscoverInfluencersView';

export default async function DiscoverInfluencersPage() {
  await requireBloggerPlusPage('/discover/influencers');
  return <DiscoverInfluencersView />;
}
