import Link from 'next/link';
import { checkFeaturePage } from '@/lib/plan-server-guards';
import FeatureLocked from '@/components/gate/FeatureLocked';
import BlogRankingClient from './BlogRankingClient';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: '키워드 검색순위 — N인플',
  description: '특정 키워드의 상위 블로그·인플루언서 노출 순위 분석',
};

export default async function BlogRankingPage() {
  const gate = await checkFeaturePage('keywords.blog-ranking', '/keywords/blog-ranking');
  if (!gate.allowed) return <FeatureLocked required={gate.required} />;

  return (
    <div className="max-w-4xl mx-auto px-4 pt-6 space-y-4">
      <Link href="/#keyword-ranking" className="inline-flex items-center gap-1 text-xs font-semibold text-dim hover:text-accent transition">
        ← 블로그 분석 대시보드로
      </Link>
      <BlogRankingClient />
    </div>
  );
}
