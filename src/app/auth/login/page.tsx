'use client';

import { useState } from 'react';
import Link from 'next/link';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  return (
    <div className="min-h-[60vh] flex items-center justify-center">
      <div className="w-full max-w-sm space-y-6">
        <div className="text-center">
          <div className="w-14 h-14 rounded-xl bg-accent flex items-center justify-center text-white font-bold text-2xl mx-auto mb-4">N</div>
          <h1 className="text-2xl font-extrabold">로그인</h1>
          <p className="text-sm text-dim mt-1">네이버 인플루언서 키워드챌린지 대시보드</p>
        </div>

        <div className="space-y-4">
          <div>
            <label className="text-xs font-semibold text-dim block mb-1.5">이메일</label>
            <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="email@example.com"
              className="w-full px-4 py-3 bg-surface border border-border rounded-xl text-sm text-text placeholder:text-dim focus:outline-none focus:border-accent transition" />
          </div>
          <div>
            <label className="text-xs font-semibold text-dim block mb-1.5">비밀번호</label>
            <input type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="비밀번호 입력"
              className="w-full px-4 py-3 bg-surface border border-border rounded-xl text-sm text-text placeholder:text-dim focus:outline-none focus:border-accent transition" />
          </div>

          <button className="w-full py-3 bg-accent text-white font-bold rounded-xl hover:bg-accent-hover transition cursor-pointer">
            로그인
          </button>

          <div className="relative">
            <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-border"></div></div>
            <div className="relative flex justify-center text-xs"><span className="bg-bg px-3 text-dim">또는</span></div>
          </div>

          <button className="w-full py-3 bg-[#03C75A] text-white font-bold rounded-xl hover:bg-[#02B550] transition flex items-center justify-center gap-2 cursor-pointer">
            <span className="text-lg font-bold">N</span>
            네이버로 로그인
          </button>
        </div>

        <p className="text-center text-xs text-dim">
          계정이 없으신가요? <Link href="/auth/signup" className="text-accent font-semibold hover:underline">회원가입</Link>
        </p>
      </div>
    </div>
  );
}
