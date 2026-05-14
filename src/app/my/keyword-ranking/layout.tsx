import { requireBloggerPlusPage } from '@/lib/plan-server-guards';

export default async function KeywordRankingLayout({ children }: { children: React.ReactNode }) {
  await requireBloggerPlusPage('/my/keyword-ranking');
  return <>{children}</>;
}
