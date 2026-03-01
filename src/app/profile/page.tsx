'use client';

import Link from 'next/link';

const user = {
  email: 'user@example.com',
  nickname: '오렌지마케터',
  point_balance: 1200,
  total_charged: 8000,
  total_used: 6800,
  linked_influencer: '오렌지도서관',
  created_at: '2026-02-15',
};

const recentHistory = [
  { type: 'deduct', description: '키워드 상세 열람: 미니멀라이프', amount: -30, date: '2026-03-01 14:23' },
  { type: 'deduct', description: '순위 전체 열람: AI활용법', amount: -50, date: '2026-03-01 13:10' },
  { type: 'charge', description: '프로 패키지 충전', amount: 1200, date: '2026-02-28 09:45' },
  { type: 'deduct', description: '인플루언서 프로필 열람: 뷰티짱', amount: -50, date: '2026-02-27 16:30' },
  { type: 'deduct', description: '추천 전체 열람', amount: -50, date: '2026-02-27 10:15' },
  { type: 'charge', description: '스타터 패키지 충전', amount: 550, date: '2026-02-20 11:00' },
];

export default function ProfilePage() {
  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <h1 className="text-xl font-bold">내 프로필</h1>

      <div className="bg-surface rounded-xl border border-border p-5 space-y-4">
        <div className="flex items-center gap-4">
          <div className="w-14 h-14 bg-accent/20 rounded-full flex items-center justify-center text-xl font-bold text-accent">
            {user.nickname[0]}
          </div>
          <div>
            <p className="font-bold text-lg">{user.nickname}</p>
            <p className="text-sm text-dim">{user.email}</p>
            <p className="text-xs text-dim">가입일: {user.created_at}</p>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-3 pt-3 border-t border-border">
          <div className="text-center">
            <p className="text-xl font-bold text-accent font-rank">{user.point_balance.toLocaleString()}</p>
            <p className="text-xs text-dim">보유 포인트</p>
          </div>
          <div className="text-center">
            <p className="text-xl font-bold text-up font-rank">{user.total_charged.toLocaleString()}</p>
            <p className="text-xs text-dim">총 충전</p>
          </div>
          <div className="text-center">
            <p className="text-xl font-bold text-dim font-rank">{user.total_used.toLocaleString()}</p>
            <p className="text-xs text-dim">총 사용</p>
          </div>
        </div>
      </div>

      <div className="bg-surface rounded-xl border border-border p-5">
        <h3 className="font-bold text-sm mb-3">연결된 인플루언서</h3>
        {user.linked_influencer ? (
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-accent/20 rounded-full flex items-center justify-center font-bold text-accent">
                {user.linked_influencer[0]}
              </div>
              <span className="font-medium">{user.linked_influencer}</span>
            </div>
            <Link href="/my" className="text-sm text-accent font-semibold">대시보드 →</Link>
          </div>
        ) : (
          <Link href="/my/link" className="block text-center py-3 bg-accent/12 rounded-lg text-accent font-semibold text-sm">
            인플루언서 계정 연결하기
          </Link>
        )}
      </div>

      <div className="bg-surface rounded-xl border border-border overflow-hidden">
        <div className="p-4 border-b border-border">
          <h3 className="font-bold text-sm">최근 사용 내역</h3>
        </div>
        <div className="divide-y divide-border/50">
          {recentHistory.map((h, idx) => (
            <div key={idx} className="flex items-center justify-between p-4">
              <div>
                <p className="text-sm">{h.description}</p>
                <p className="text-xs text-dim">{h.date}</p>
              </div>
              <span className={`font-bold text-sm font-rank ${h.amount > 0 ? 'text-up' : 'text-down'}`}>
                {h.amount > 0 ? '+' : ''}{h.amount}P
              </span>
            </div>
          ))}
        </div>
      </div>

      <div className="flex gap-3">
        <Link href="/charge" className="flex-1 text-center py-3 bg-accent text-white rounded-xl font-semibold hover:bg-accent-hover transition">
          포인트 충전
        </Link>
        <button className="flex-1 py-3 bg-surface border border-border text-dim rounded-xl font-semibold text-sm hover:border-accent/40 transition cursor-pointer">
          로그아웃
        </button>
      </div>
    </div>
  );
}
