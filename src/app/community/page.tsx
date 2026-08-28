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
  /** 로그인 여부를 **확인하지 못한** 상태. '비로그인'과 같은 화면을 보여주면 안 된다. */
  const [authFailed, setAuthFailed] = useState(false);

  useEffect(() => {
    // ⚠️ 예전엔 res.ok 를 안 보고 곧장 .json() 했고, 실패하면 catch 가 로그아웃 상태를 지어냈다.
    //    그러면 로그인해 둔 사람에게 "로그인 후 이용할 수 있습니다"가 뜬다 — 확인 실패를
    //    로그아웃으로 단정하는 거짓말이다.
    fetch('/api/auth/me')
      .then(async r => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json() as Promise<Me>;
      })
      .then((data: Me) => setMe(data))
      .catch(() => setAuthFailed(true))
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
      ) : authFailed ? (
        <div className="text-center py-16 space-y-4">
          <p className="text-text font-semibold">로그인 상태를 확인하지 못했습니다.</p>
          <p className="text-dim text-sm">로그아웃되었다는 뜻이 아닙니다. 잠시 후 다시 시도해 주세요.</p>
          <button
            onClick={() => window.location.reload()}
            className="inline-block px-5 py-2.5 bg-accent text-white rounded-xl font-bold hover:bg-accent-hover transition"
          >
            다시 시도
          </button>
        </div>
      ) : !me?.id ? (
        <div className="text-center py-16 space-y-4">
          <p className="text-dim">커뮤니티는 로그인 후 이용할 수 있습니다.</p>
          {/* ⚠️ 예전 링크는 `/login` 이었는데 그런 경로는 없다(프로덕션 실측 404).
              로그인하라고 해놓고 404 로 보내면 막다른 길이다. 실제 경로는 `/auth/login`
              (→ `/?authModal=login`)이고, 돌아올 곳을 붙여 로그인 후 커뮤니티로 복귀시킨다. */}
          <Link
            href={`/?memberOnly=1&redirect=${encodeURIComponent('/community')}`}
            className="inline-block px-5 py-2.5 bg-accent text-white rounded-xl font-bold hover:bg-accent-hover transition"
          >
            로그인
          </Link>
        </div>
      ) : me.restricted ? (
        /* 이유도 다음 행동도 없으면 막다른 길이다. 무엇 때문인지·어디로 문의하는지 같이 적는다. */
        <div className="text-center py-16 space-y-2">
          <p className="text-down font-semibold">해당 계정은 커뮤니티를 이용할 수 없습니다.</p>
          <p className="text-dim text-sm">신고 누적 또는 이용약관 위반으로 커뮤니티 이용이 제한된 상태입니다.</p>
          <p className="text-dim text-sm">
            제한 사유가 궁금하거나 이의가 있으면 오른쪽 아래 <b className="font-semibold text-text">고객센터</b>로 문의해 주세요.
          </p>
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
