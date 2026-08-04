'use client';

import { use } from 'react';
import TopicDetailSection from '@/components/dashboard/TopicDetailSection';

export default function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  return <TopicDetailSection topicId={id} />;
}
