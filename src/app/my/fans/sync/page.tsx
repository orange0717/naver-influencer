'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { fanBookmarkletCode } from '@/lib/fan-bookmarklet';
import { createSupabaseBrowserClient } from '@/lib/supabase-browser';

function StepBadge({ n }: { n: number }) {
  return (
    <span className="shrink-0 w-7 h-7 rounded-full bg-accent text-white text-sm font-bold flex items-center justify-center">
      {n}
    </span>
  );
}

export default function FansSyncPage() {
  const router = useRouter();
  const [pasted, setPasted] = useState('');
  const [status, setStatus] = useState<{ type: 'idle' | 'loading' | 'ok' | 'err'; message: string }>({ type: 'idle', message: '' });
  const [authReady, setAuthReady] = useState(false);

  useEffect(() => {
    const check = async () => {
      const supabase = createSupabaseBrowserClient();
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        // 회원 전용 모달(가입/로그인 둘 다)로 통일(2026-08-28 오렌지 승인 "C를 B로 합치기").
        router.replace(`/?memberOnly=1&redirect=${encodeURIComponent('/my/fans/sync')}`);
        return;
      }
      setAuthReady(!!session);
    };
    check();
  }, [router]);

  const handlePasteFromClipboard = async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (text && text.trim()) {
        setPasted(text);
        setStatus({ type: 'idle', message: '' });
      } else {
        setStatus({ type: 'err', message: '클립보드가 비어 있어요. STEP 2를 먼저 진행했는지 확인하세요.' });
      }
    } catch {
      setStatus({ type: 'err', message: '브라우저가 클립보드 읽기를 막았어요. 아래 칸을 누르고 직접 Cmd/Ctrl+V로 붙여넣어 주세요.' });
    }
  };

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
        <div className="mb-5">
          <Link href="/my/fans" className="text-xs text-dim hover:text-accent transition">← 맞팬 관리로 돌아가기</Link>
          <h1 className="type-page-title text-text mt-2">팬 데이터 동기화</h1>
          <p className="text-sm text-dim mt-1">
            <b className="text-text">크롬 확장 설치 없이</b>, PC에서 3단계면 끝나요. 아래 순서대로만 따라 하세요.
          </p>
        </div>

        {/* 북마클릿이 뭔지 모르는 사용자용 설명 */}
        <div className="mb-5 p-4 bg-accent/5 rounded-xl border border-accent/30">
          <p className="text-sm font-bold text-text">&lsquo;북마클릿&rsquo;이 뭔가요?</p>
          <p className="text-xs text-dim mt-1.5 leading-relaxed">
            즐겨찾기(북마크)처럼 브라우저에 <b className="text-text">한 번 저장해두는 작은 버튼</b>이에요.
            프로그램이 아니라 즐겨찾기라서 <b className="text-text">설치가 필요 없고</b>, 저장해두면 네이버 내 홈에서 한 번 클릭할 때마다
            내 팬 목록을 자동으로 모아 줍니다. 아래에서 딱 한 번만 등록하면 됩니다.
          </p>
          <p className="text-[11px] text-dim mt-2">
            ※ 북마크바 드래그가 필요해 <b className="text-text">PC(데스크톱) 브라우저</b>에서 진행하세요. 모바일은 북마클릿 실행이 제한됩니다.
          </p>
        </div>

        {/* STEP 1 */}
        <div className="mb-4 p-5 bg-surface rounded-lg border border-border">
          <div className="flex items-center gap-2.5">
            <StepBadge n={1} />
            <h2 className="text-base font-bold text-text">버튼을 북마크바로 드래그해 저장</h2>
          </div>
          <p className="text-xs text-dim mt-2 pl-9">
            아래 <span className="font-semibold text-text">📌 N인플 팬 동기화</span> 버튼을 마우스로 잡아
            브라우저 상단 <span className="font-semibold text-text">북마크바로 끌어다 놓으세요</span>.
            북마크바가 안 보이면 <code className="px-1 py-0.5 bg-bg rounded text-[11px]">⌘+Shift+B</code>(Mac) /
            <code className="px-1 py-0.5 bg-bg rounded text-[11px]">Ctrl+Shift+B</code>(Win)로 켤 수 있어요.
          </p>
          <div className="mt-3 pl-9 flex items-center gap-3 flex-wrap">
            <a
              href={fanBookmarkletCode}
              onClick={(e) => e.preventDefault()}
              className="inline-block px-4 py-2 rounded-lg bg-accent text-white text-sm font-bold hover:opacity-90 transition cursor-grab active:cursor-grabbing select-none"
              draggable
              title="이 버튼을 북마크바로 드래그하세요"
            >
              📌 N인플 팬 동기화
            </a>
            <span className="text-xs text-dim">← 이 버튼을 북마크바로 끌어다 놓기 (클릭 아님)</span>
          </div>
          <details className="mt-3 pl-9">
            <summary className="text-xs text-dim cursor-pointer hover:text-text">드래그가 어렵나요? 코드를 직접 복사해 북마크로 만들기</summary>
            <p className="text-[11px] text-dim mt-2 leading-relaxed">
              북마크바 빈 곳 우클릭 → &ldquo;페이지 추가/북마크 추가&rdquo; → 이름은 아무거나, URL 칸에 아래 코드를 통째로 붙여넣고 저장하세요.
            </p>
            <textarea
              readOnly
              value={fanBookmarkletCode}
              onClick={(e) => (e.target as HTMLTextAreaElement).select()}
              className="mt-2 w-full h-20 p-2 text-[10px] font-mono bg-bg border border-border rounded text-text"
            />
          </details>
        </div>

        {/* STEP 2 */}
        <div className="mb-4 p-5 bg-surface rounded-lg border border-border">
          <div className="flex items-center gap-2.5">
            <StepBadge n={2} />
            <h2 className="text-base font-bold text-text">내 네이버 인플루언서 홈에서 버튼 클릭</h2>
          </div>
          <ol className="mt-2 pl-9 text-xs text-dim space-y-1.5 list-decimal ml-4">
            <li>네이버에 <b className="text-text">로그인</b>한 상태에서 <b className="text-text">내 인플루언서 홈</b>(<code className="px-1 py-0.5 bg-bg rounded text-[11px]">in.naver.com/내아이디</code>)으로 이동하세요.</li>
            <li>방금 북마크바에 저장한 <span className="font-semibold text-text">📌 N인플 팬 동기화</span>를 클릭합니다.</li>
            <li>잠시 후 <span className="font-semibold text-text">&ldquo;✅ 복사 완료&rdquo;</span> 알림이 뜨면, 내 팬 데이터가 클립보드에 담긴 거예요.</li>
          </ol>
          <div className="mt-3 pl-9">
            <a
              href="https://in.naver.com/"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-block text-xs px-3 py-1.5 rounded-lg border border-accent/40 text-accent font-semibold hover:bg-accent/5 transition"
            >
              네이버 인플루언서 열기 →
            </a>
            <span className="ml-2 text-[11px] text-dim">로그인 후 우측 상단 내 프로필 → &ldquo;내 인플루언서 홈&rdquo;</span>
          </div>
        </div>

        {/* STEP 3 */}
        <div className="mb-5 p-5 bg-surface rounded-lg border border-border">
          <div className="flex items-center gap-2.5">
            <StepBadge n={3} />
            <h2 className="text-base font-bold text-text">여기 붙여넣고 업로드</h2>
          </div>
          <div className="mt-3 pl-9">
            <button
              onClick={handlePasteFromClipboard}
              className="text-xs px-3 py-1.5 rounded-lg bg-bg border border-border text-text font-semibold hover:border-accent transition"
            >
              📋 클립보드에서 붙여넣기
            </button>
            <span className="ml-2 text-[11px] text-dim">또는 아래 칸을 누르고 Cmd/Ctrl+V</span>
            <textarea
              value={pasted}
              onChange={(e) => setPasted(e.target.value)}
              placeholder="STEP 2에서 복사된 데이터를 여기에 붙여넣으세요"
              className="mt-2 w-full h-28 p-3 text-xs font-mono bg-bg border border-border rounded-lg text-text placeholder:text-dim focus:outline-none focus:border-accent"
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
            {status.type === 'ok' && (
              <Link href="/my/fans" className="inline-block mt-3 text-xs px-3 py-1.5 rounded-lg bg-accent text-white font-semibold hover:opacity-90 transition">
                맞팬 관리에서 결과 보기 →
              </Link>
            )}
          </div>
        </div>

        {/* 안전 안내 */}
        <div className="text-[11px] text-dim leading-relaxed mb-5">
          <p className="font-semibold text-text mb-1">안전한가요?</p>
          <p>
            북마클릿은 <b className="text-text">내가 내 네이버 홈에서 내 팬 목록을 읽어오는</b> 방식입니다.
            내 네이버 비밀번호·쿠키는 외부로 전송되지 않고, 추출된 데이터(JSON)는 내가 직접 붙여넣어 업로드할 때만 N인플 서버로 전달됩니다.
          </p>
        </div>

        {/* 선택: 크롬 확장 (자동화가 필요한 사람만) */}
        <details className="p-4 bg-surface rounded-lg border border-border">
          <summary className="text-sm font-semibold text-text cursor-pointer">
            매번 누르기 번거롭나요? (선택) 크롬 확장으로 자동화
          </summary>
          <div className="mt-2 flex items-start justify-between gap-3 flex-wrap">
            <p className="text-xs text-dim leading-relaxed flex-1 min-w-[200px]">
              크롬 확장을 한 번 설치하면 내 인플루언서 홈을 방문할 때 백그라운드에서 자동 동기화됩니다(30분 쿨다운).
              <b className="text-text"> 필수는 아니에요</b> — 위 북마클릿만으로도 똑같이 동작합니다.
            </p>
            <a
              href="https://github.com/orange0717/naver-influencer/tree/main/extension#설치"
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs px-3 py-1.5 rounded-lg border border-border text-text font-semibold hover:border-accent transition whitespace-nowrap"
            >
              설치 방법 →
            </a>
          </div>
        </details>
      </div>
    </div>
  );
}
