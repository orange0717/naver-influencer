import GlassCard from './GlassCard';
import CopyButton from '@/components/CopyButton';

interface WidgetSectionProps {
  naverId: string;
}

export default function WidgetSection({ naverId }: WidgetSectionProps) {
  const baseUrl = 'https://naver-influencer.vercel.app';
  const top3WidgetUrl = `${baseUrl}/api/widget/top3/${naverId}`;
  const top3Html = `<a href="${top3WidgetUrl}" download><img src="${top3WidgetUrl}" alt="N인플 TOP3 달성률" width="170" /></a>`;

  return (
    <GlassCard>
      <div className="flex items-center justify-between mb-3">
        <div>
          <h3 className="font-bold text-[15px]">블로그 위젯</h3>
          <p className="text-[11px] text-dim mt-0.5">내 블로그에 뱃지를 달아보세요</p>
        </div>
      </div>
      <div className="flex justify-center mb-4">
        <div className="flex flex-col items-center p-4 bg-bg rounded-xl">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <a href={`/api/widget/top3/${naverId}`} download={`ninfl-top3-${naverId}.svg`} title="클릭하여 이미지 다운로드">
            <img src={`/api/widget/top3/${naverId}`} alt="TOP 3 달성률 위젯" width={170} height={140} className="rounded-lg cursor-pointer hover:opacity-80 transition" />
          </a>
          <p className="text-[10px] text-dim mt-2">키워드챌린지 TOP 3 달성률</p>
        </div>
      </div>
      <p className="text-[10px] text-dim text-center mb-4">이미지를 클릭하면 다운로드할 수 있습니다</p>
      <div>
        <p className="text-[11px] font-semibold text-dim mb-1.5">위젯 HTML</p>
        <div className="relative">
          <code className="block bg-bg border border-border rounded-lg p-3 text-[11px] text-dim font-mono break-all leading-relaxed select-all">
            {top3Html}
          </code>
          <CopyButton text={top3Html} />
        </div>
        <p className="text-[10px] text-dim leading-relaxed mt-3">* 위젯은 매일 자동으로 업데이트됩니다.</p>
      </div>
    </GlassCard>
  );
}
