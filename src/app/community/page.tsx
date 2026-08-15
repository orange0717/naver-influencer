'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import ChatRoom from '@/components/chat/ChatRoom';

interface Me {
  type: string | null;
  id: string | null;
  name: string | null;
  restricted?: boolean;
  isAdmin?: boolean;
}

export default function CommunityPage() {
  const [me, setMe] = useState<Me | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/auth/me')
      .then(r => r.json())
      .then((data: Me) => setMe(data))
      .catch(() => setMe({ type: null, id: null, name: null }))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="max-w-7xl mx-auto space-y-3 min-h-[calc(100vh-10rem)] px-2 sm:px-4">
      <div className="pt-4">
        <p className="text-xs text-accent font-semibold tracking-widest mb-1">COMMUNITY</p>
        <h1 className="type-page-title text-text">커뮤니티</h1>
        <p className="text-xs text-dim mt-1">
          예의를 지켜 대화해주세요. 비속어는 자동 필터링되며, 부적절한 메시지는 신고로 숨김 처리됩니다.
        </p>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <span className="inline-block w-6 h-6 border-2 border-accent/30 border-t-accent rounded-full animate-spin" />
        </div>
      ) : !me?.id ? (
        <div className="text-center py-16 space-y-4">
          <p className="text-dim">커뮤니티는 로그인 후 이용할 수 있습니다.</p>
          <Link href="/login" className="inline-block px-5 py-2.5 bg-accent text-white rounded-xl font-bold hover:bg-accent-hover transition">
            로그인
          </Link>
        </div>
      ) : me.restricted ? (
        <div className="text-center py-16">
          <p className="text-down font-semibold">해당 계정은 커뮤니티를 이용할 수 없습니다.</p>
        </div>
      ) : (
        <ChatRoom
          currentUserId={me.id}
          currentUserType={(me.type === 'influencer' || me.type === 'blogger') ? me.type : 'influencer'}
          isAdmin={!!me.isAdmin}
        />
      )}
    </div>
  );
}
