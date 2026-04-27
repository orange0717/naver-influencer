'use client';

/**
 * ApiDownBanner — 외부 AI API 잔액 부족으로 AI 기능이 일시 중단된 상태를
 * 모든 페이지 상단에 알리는 배너.
 *
 * 닫기 버튼은 sessionStorage 에 임시 저장 (같은 세션 동안 안 보임).
 * 복구 시 layout.tsx 에서 이 컴포넌트만 제거하면 됩니다.
 */

import { useEffect, useState } from 'react';

const STORAGE_KEY = 'ninfl.apiDownBanner.dismissed';

export default function ApiDownBanner() {
  const [show, setShow] = useState(false);

  useEffect(() => {
    try {
      if (sessionStorage.getItem(STORAGE_KEY) !== '1') setShow(true);
    } catch {
      setShow(true);
    }
  }, []);

  if (!show) return null;

  return (
    <div
      role="alert"
      className="sticky top-0 z-[2147483640] w-full"
      style={{ background: '#7A2E2E', color: '#fff' }}
    >
      <div className="relative max-w-7xl mx-auto px-4 py-2.5 pr-12 text-sm leading-snug font-semibold text-center">
        AI 기능 일시 중단 — 외부 AI API 잔액이 소진되어 챗봇 등 AI 관련
        기능이 일시적으로 동작하지 않습니다. 충전 후 빠르게 복구하겠습니다.
        키워드·인플루언서·랭킹 등 일반 기능은 정상 동작합니다.
        <button
          type="button"
          aria-label="배너 닫기"
          onClick={() => {
            try {
              sessionStorage.setItem(STORAGE_KEY, '1');
            } catch {}
            setShow(false);
          }}
          className="absolute right-2 top-1/2 -translate-y-1/2 w-7 h-7 text-xl leading-none opacity-85 hover:opacity-100"
          style={{ background: 'transparent', border: 0, color: '#fff', cursor: 'pointer' }}
        >
          ×
        </button>
      </div>
    </div>
  );
}
