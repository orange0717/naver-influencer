'use client';

import { useState } from 'react';
import GlassCard from './GlassCard';
import CopyButton from '@/components/CopyButton';

interface WidgetSectionProps {
  naverId: string;
  displayName: string;
}

export default function WidgetSection({ naverId, displayName }: WidgetSectionProps) {
  const [showHtml, setShowHtml] = useState(false);
  const baseUrl = 'https://naver-influencer.vercel.app';
  const top3WidgetUrl = `${baseUrl}/api/widget/top3/${naverId}`;
  const profileUrl = `${baseUrl}/influencers/${naverId}`;

  const embedHtml = `<a href="${profileUrl}" target="_blank"><img src="${top3WidgetUrl}" alt="${displayName} N인플 TOP3 달성률" width="160" height="172" style="border-radius:16px;" /></a>`;

  return (
    <GlassCard>
      <div className="flex items-center justify-between mb-3">
        <div>
          <h3 className="font-bold text-[15px]">블로그 위젯</h3>
          <p className="text-[11px] text-dim mt-0.5">내 블로그에 뱃지를 달아보세요</p>
        </div>
      </div>

      {/* 위젯 미리보기 */}
      <div className="flex justify-center mb-4">
        <div className="flex flex-col items-center p-4 bg-bg rounded-xl">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <button
            type="button"
            onClick={() => setShowHtml((v) => !v)}
            className="block bg-transparent border-0 p-0 cursor-pointer"
            title="클릭하여 위젯 HTML 코드 보기"
          >
            <img src={`/api/widget/top3/${naverId}`} alt="TOP 3 달성률 위젯" width={160} height={172} className="rounded-2xl hover:opacity-80 transition" />
          </button>
          <p className="text-[10px] text-dim mt-2">키워드챌린지 TOP 3 달성률</p>
        </div>
      </div>
      <p className="text-[10px] text-dim text-center mb-4">
        이미지를 클릭하면 위젯 HTML 코드를 {showHtml ? '숨길' : '볼'} 수 있습니다
      </p>

      {/* 위젯 HTML */}
      {showHtml && (
        <div>
          <p className="text-[11px] font-semibold text-dim mb-1.5">위젯 HTML</p>
          <div className="relative">
            <code className="block bg-bg border border-border rounded-lg p-3 text-[11px] text-dim font-mono break-all leading-relaxed select-all">
              {embedHtml}
            </code>
            <CopyButton text={embedHtml} />
          </div>
        </div>
      )}

      <p className="text-[10px] text-dim leading-relaxed mt-3">* 위젯은 매일 자동으로 업데이트됩니다.</p>
    </GlassCard>
  );
}
