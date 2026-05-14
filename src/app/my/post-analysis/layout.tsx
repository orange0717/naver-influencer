import { requireBloggerPlusPage } from '@/lib/plan-server-guards';

export default async function PostAnalysisLayout({ children }: { children: React.ReactNode }) {
  await requireBloggerPlusPage('/my/post-analysis');
  return <>{children}</>;
}
