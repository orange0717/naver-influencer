import { redirect } from 'next/navigation';
import { createRouteHandlerClient } from '@/lib/supabase-server';
import SavedKeywords from '@/components/dashboard/SavedKeywords';

export const dynamic = 'force-dynamic';

export default async function SavedKeywordsPage() {
  const supabase = await createRouteHandlerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/auth/login');

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h1 className="text-xl font-extrabold">저장 키워드</h1>
        <p className="text-xs text-dim">검색·내 키워드 페이지에서 저장한 키워드를 한곳에서 모아 봅니다</p>
      </div>
      <SavedKeywords />
    </div>
  );
}
