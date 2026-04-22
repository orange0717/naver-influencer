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

export default function ChatPage() {
  const [me, setMe] = useState<Me | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/auth/me')
      .then(r => r.json())
      .then((data: Me) => setMe(data))
      .catch(() => setMe({ type: null, id: null, name: null }))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="max-w-4xl mx-auto flex items-center justify-center py-20">
        <span className="inline-block w-6 h-6 border-2 border-accent/30 border-t-accent rounded-full animate-spin" />
      </div>
    );
  }

  if (!me?.id) {
    return (
      <div className="max-w-2xl mx-auto text-center py-16 space-y-4">
        <h1 className="font-title text-2xl font-extrabold text-text">채팅방</h1>
        <p className="text-dim">채팅방은 로그인 후 이용할 수 있습니다.</p>
        <Link href="/login" className="inline-block px-5 py-2.5 bg-accent text-white rounded-xl font-bold hover:bg-accent-hover transition">
          로그인
        </Link>
      </div>
    );
  }

  if (me.restricted) {
    return (
      <div className="max-w-2xl mx-auto text-center py-16 space-y-4">
        <h1 className="font-title text-2xl font-extrabold text-text">채팅방</h1>
        <p className="text-down font-semibold">해당 계정은 채팅을 이용할 수 없습니다.</p>
      </div>
    );
  }

  const currentUserType = (me.type === 'influencer' || me.type === 'blogger') ? me.type : 'influencer';

  return (
    <div className="max-w-4xl mx-auto space-y-4 min-h-[calc(100vh-10rem)]">
      <div className="flex items-center justify-between pt-4">
        <div>
          <p className="text-xs text-accent font-semibold tracking-widest mb-1">COMMUNITY CHAT</p>
          <h1 className="font-title text-2xl md:text-3xl font-extrabold text-text">실시간 채팅방</h1>
          <p className="text-xs text-dim mt-1">예의를 지켜 대화해주세요. 비속어는 자동 필터링되며, 부적절한 메시지는 신고로 숨김 처리됩니다.</p>
        </div>
        <Link
          href="/community"
          className="text-sm text-dim hover:text-text transition"
        >
          ← 게시판
        </Link>
      </div>

      <ChatRoom
        currentUserId={me.id}
        currentUserType={currentUserType}
        isAdmin={!!me.isAdmin}
      />
    </div>
  );
}
