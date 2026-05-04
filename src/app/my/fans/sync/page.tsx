'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { fanBookmarkletCode } from '@/lib/fan-bookmarklet';
import { createSupabaseBrowserClient } from '@/lib/supabase-browser';

export default function FansSyncPage() {
  const [pasted, setPasted] = useState('');
  const [status, setStatus] = useState<{ type: 'idle' | 'loading' | 'ok' | 'err'; message: string }>({ type: 'idle', message: '' });
  const [authReady, setAuthReady] = useState(false);

  useEffect(() => {
    const check = async () => {
      const supabase = createSupabaseBrowserClient();
      const { data: { session } } = await supabase.auth.getSession();
      setAuthReady(!!session);
    };
    check();
  }, []);

  const handleUpload = async () => {
    setStatus({ type: 'loading', message: '업로드 중…' });
    try {
      const supabase = createSupabaseBrowserClient();
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        setStatus({ type: 'err', message: '로그인이 필요합니다.' });
        return;
      }

      let payload: unknown;
      try {
        payload = JSON.parse(pasted);
      } catch {
        setStatus({ type: 'err', message: 'JSON 형식이 올바르지 않습니다. 북마클릿이 복사한 내용을 그대로 붙여넣으세요.' });
        return;
      }

      const res = await fetch('/api/my/fans/upload', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify(payload),
      });
      const json = await res.json();
      if (!res.ok) {
        setStatus({ type: 'err', message: json.error || `HTTP ${res.status}` });
        return;
      }
      const c = json.counts || {};
      setStatus({
        type: 'ok',
        message: `✅ 업로드 완료 — 나를 팬 ${c.followers ?? 0}명 / 내가 팬 ${c.followings ?? 0}명 (신규 +${c.added ?? 0}, 사라짐 -${c.removed ?? 0})`,
      });
      setPasted('');
    } catch (e) {
      setStatus({ type: 'err', message: e instanceof Error ? e.message : '업로드 실패' });
    }
  };

  return (
    <div className="min-h-screen bg-bg">
      <div className="max-w-3xl mx-auto px-4 py-8">
        <div className="mb-6">
          <Link href="/my/fans" className="text-xs text-dim hover:text-accent transition">← 내 팬 관리로 돌아가기</Link>
          <h1 className="text-2xl font-bold text-text mt-2">팬 데이터 동기화</h1>
          <p className="text-sm text-dim mt-1">
            네이버 인플루언서 페이지의 follower/following 데이터를 N인플 대시보드로 가져옵니다.
          </p>
        </div>

        {/* 단계 1 */}
        <div className="mb-5 p-5 bg-surface rounded-xl border border-border">
          <p className="text-xs font-bold text-accent">STEP 1</p>
          <h2 className="text-base font-bold text-text mt-1">북마클릿 등록</h2>
          <p className="text-xs text-dim mt-2">
            아래 버튼을 <span className="font-semibold text-text">브라우저 북마크바로 드래그</span>하세요. 북마크바가 안 보이면 <code className="px-1 py-0.5 bg-bg rounded text-[11px]">⌘+Shift+B</code> (Mac) / <code className="px-1 py-0.5 bg-bg rounded text-[11px]">Ctrl+Shift+B</code> (Win)로 표시할 수 있습니다.
          </p>
          <div className="mt-3 flex items-center gap-3">
            <a
              href={fanBookmarkletCode}
              onClick={(e) => e.preventDefault()}
              className="inline-block px-4 py-2 rounded-lg bg-accent text-white text-sm font-bold hover:opacity-90 transition cursor-grab active:cursor-grabbing"
              draggable
              title="이 버튼을 북마크바로 드래그하세요"
            >
              📌 N인플 팬 동기화
            </a>
            <span className="text-xs text-dim">↑ 이 버튼을 북마크바로 끌어다 놓으세요</span>
          </div>
          <details className="mt-3">
            <summary className="text-xs text-dim cursor-pointer hover:text-text">대신 코드를 직접 복사하기</summary>
            <textarea
              readOnly
              value={fanBookmarkletCode}
              onClick={(e) => (e.target as HTMLTextAreaElement).select()}
              className="mt-2 w-full h-20 p-2 text-[10px] font-mono bg-bg border border-border rounded text-text"
            />
          </details>
        </div>

        {/* 단계 2 */}
        <div className="mb-5 p-5 bg-surface rounded-xl border border-border">
          <p className="text-xs font-bold text-accent">STEP 2</p>
          <h2 className="text-base font-bold text-text mt-1">네이버에서 데이터 추출</h2>
          <ol className="mt-2 text-xs text-dim space-y-1.5 list-decimal pl-5">
            <li><a href="https://in.naver.com/orangelibrary" target="_blank" rel="noopener noreferrer" className="text-accent underline">in.naver.com/[내 ID]</a> 페이지로 이동 (네이버 로그인 상태)</li>
            <li>북마크바의 <span className="font-semibold text-text">📌 N인플 팬 동기화</span> 클릭</li>
            <li>잠시 후 &quot;복사 완료&quot; 알림이 뜨면 클립보드에 데이터가 복사된 상태</li>
          </ol>
        </div>

        {/* 단계 3 */}
        <div className="mb-5 p-5 bg-surface rounded-xl border border-border">
          <p className="text-xs font-bold text-accent">STEP 3</p>
          <h2 className="text-base font-bold text-text mt-1">붙여넣고 업로드</h2>
          <textarea
            value={pasted}
            onChange={(e) => setPasted(e.target.value)}
            placeholder='여기에 붙여넣기 (Cmd+V) — 북마클릿이 복사한 JSON 데이터'
            className="mt-3 w-full h-32 p-3 text-xs font-mono bg-bg border border-border rounded-lg text-text placeholder:text-dim focus:outline-none focus:border-accent"
          />
          <div className="mt-3 flex items-center gap-3 flex-wrap">
            <button
              onClick={handleUpload}
              disabled={!authReady || !pasted.trim() || status.type === 'loading'}
              className="px-4 py-2 rounded-lg bg-accent text-white text-sm font-bold hover:opacity-90 transition disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {status.type === 'loading' ? '업로드 중…' : '업로드'}
            </button>
            {!authReady && <span className="text-xs text-down">※ 로그인이 필요합니다</span>}
            {status.type === 'ok' && <span className="text-xs text-up font-semibold">{status.message}</span>}
            {status.type === 'err' && <span className="text-xs text-down font-semibold">{status.message}</span>}
          </div>
        </div>

        <div className="text-[11px] text-dim leading-relaxed">
          <p className="font-semibold mb-1">동작 방식</p>
          <p>
            북마클릿은 네이버 페이지에서만 데이터를 읽어 클립보드에 복사합니다. 본인 네이버 쿠키는 외부로 전송되지 않으며, 추출된 데이터(JSON)는 본인이 직접 붙여넣어 업로드할 때만 N인플 서버로 전송됩니다.
          </p>
        </div>
      </div>
    </div>
  );
}
