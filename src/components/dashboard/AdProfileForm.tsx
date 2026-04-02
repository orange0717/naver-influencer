'use client';

import { useState, useEffect } from 'react';

interface AdProfileFormProps {
  initialFeeAmount: number | null;
  initialFeeText: string;
  initialProcess: string;
}

export default function AdProfileForm({ initialFeeAmount, initialFeeText, initialProcess }: AdProfileFormProps) {
  const [adFeeAmount, setAdFeeAmount] = useState<number | null>(initialFeeAmount);
  const [adFeeText, setAdFeeText] = useState(initialFeeText);
  const [adProcess, setAdProcess] = useState(initialProcess);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState('');
  const [editing, setEditing] = useState(false);

  useEffect(() => {
    setAdFeeAmount(initialFeeAmount);
    setAdFeeText(initialFeeText);
    setAdProcess(initialProcess);
  }, [initialFeeAmount, initialFeeText, initialProcess]);

  const hasData = initialFeeAmount || initialFeeText || initialProcess;

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(''), 2500);
  };

  const handleSave = async () => {
    setSaving(true);
    const res = await fetch('/api/my/ad-profile', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ad_fee_amount: adFeeAmount,
        ad_fee_text: adFeeText.trim(),
        ad_process: adProcess.trim(),
      }),
    });

    if (res.ok) {
      showToast('광고 프로필이 저장되었습니다.');
      setEditing(false);
    } else {
      const data = await res.json();
      showToast(data.error || '저장에 실패했습니다.');
    }
    setSaving(false);
  };

  // 표시 모드 (데이터 있고 편집 아닐 때)
  if (hasData && !editing) {
    return (
      <div className="space-y-3">
        {toast && (
          <div className="bg-accent/10 text-accent text-sm font-semibold px-4 py-2 rounded-lg text-center">
            {toast}
          </div>
        )}
        <div className="flex items-center justify-between">
          <h3 className="font-bold text-[15px]">광고 프로필</h3>
          <button onClick={() => setEditing(true)} className="text-xs text-accent hover:underline cursor-pointer">편집</button>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {(initialFeeAmount || initialFeeText) && (
            <div className="bg-bg rounded-xl p-3 space-y-1">
              <p className="text-xs text-dim font-semibold">원고료</p>
              {initialFeeAmount ? (
                <p className="text-lg font-bold text-accent font-rank">{initialFeeAmount.toLocaleString()}원</p>
              ) : null}
              {initialFeeText && <p className="text-sm text-text">{initialFeeText}</p>}
            </div>
          )}
          {initialProcess && (
            <div className="bg-bg rounded-xl p-3 space-y-1">
              <p className="text-xs text-dim font-semibold">진행방법</p>
              <p className="text-sm text-text whitespace-pre-line">{initialProcess}</p>
            </div>
          )}
        </div>
      </div>
    );
  }

  // 입력/편집 모드
  return (
    <div className="space-y-3">
      {toast && (
        <div className="bg-accent/10 text-accent text-sm font-semibold px-4 py-2 rounded-lg text-center">
          {toast}
        </div>
      )}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-bold text-[15px]">광고 프로필</h3>
          <p className="text-xs text-dim mt-0.5">원고료와 진행방법을 등록하면 인플루언서 상세 페이지에 표시됩니다.</p>
        </div>
        {editing && (
          <button onClick={() => setEditing(false)} className="text-xs text-dim hover:text-text cursor-pointer">취소</button>
        )}
      </div>

      <div className="space-y-3">
        <div>
          <label className="text-xs text-dim font-semibold block mb-1">원고료 금액</label>
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-dim">&#8361;</span>
            <input
              type="number"
              value={adFeeAmount ?? ''}
              onChange={e => setAdFeeAmount(e.target.value ? Math.max(0, parseInt(e.target.value)) : null)}
              placeholder="예: 30000"
              min="0"
              max="99999999"
              className="w-full pl-8 pr-3 py-2 bg-bg border border-border rounded-lg text-sm text-text placeholder:text-dim focus:outline-none focus:border-accent transition-colors"
            />
          </div>
        </div>

        <div>
          <label className="text-xs text-dim font-semibold block mb-1">원고료 설명 <span className="text-dim font-normal">(선택)</span></label>
          <input
            type="text"
            value={adFeeText}
            onChange={e => setAdFeeText(e.target.value)}
            placeholder="예: 협의 가능, 키워드에 따라 상이"
            maxLength={200}
            className="w-full px-3 py-2 bg-bg border border-border rounded-lg text-sm text-text placeholder:text-dim focus:outline-none focus:border-accent transition-colors"
          />
        </div>

        <div>
          <label className="text-xs text-dim font-semibold block mb-1">진행방법 <span className="text-dim font-normal">(선택)</span></label>
          <textarea
            value={adProcess}
            onChange={e => setAdProcess(e.target.value)}
            placeholder="예: 키워드 협의 후 원고 작성, 검수 1회 포함, 발행 후 30일 유지"
            maxLength={1000}
            rows={3}
            className="w-full px-3 py-2 bg-bg border border-border rounded-lg text-sm text-text placeholder:text-dim focus:outline-none focus:border-accent transition-colors resize-none"
          />
          <p className="text-xs text-dim text-right mt-0.5">{adProcess.length}/1000</p>
        </div>

        <button
          onClick={handleSave}
          disabled={saving}
          className="px-4 py-2 bg-accent text-white text-sm font-bold rounded-lg hover:bg-accent-hover transition cursor-pointer disabled:opacity-50"
        >
          {saving ? '저장 중...' : '광고 프로필 저장'}
        </button>
      </div>
    </div>
  );
}
