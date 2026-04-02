import GlassCard from './GlassCard';
import CopyButton from '@/components/CopyButton';

interface WidgetSectionProps {
  naverId: string;
  displayName: string;
}

export default function WidgetSection({ naverId, displayName }: WidgetSectionProps) {
  const baseUrl = 'https://naver-influencer.vercel.app';
  const top3WidgetUrl = `${baseUrl}/api/widget/top3/${naverId}`;
  const profileUrl = `${baseUrl}/influencers/${naverId}`;

  const embedHtml = `<a href="${profileUrl}" target="_blank"><img src="${top3WidgetUrl}" alt="${displayName} N인플 TOP3 달성률" width="160" style="border-radius:16px;" /></a>`;
  const blogHashtag = `#N인플 #${displayName} #키워드챌린지 #TOP3달성률 #네이버인플루언서`;

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
          <a href={`/api/widget/top3/${naverId}`} download={`ninfl-top3-${naverId}.svg`} title="클릭하여 이미지 다운로드">
            <img src={`/api/widget/top3/${naverId}`} alt="TOP 3 달성률 위젯" width={160} height={160} className="rounded-2xl cursor-pointer hover:opacity-80 transition" />
          </a>
          <p className="text-[10px] text-dim mt-2">키워드챌린지 TOP 3 달성률</p>
        </div>
      </div>
      <p className="text-[10px] text-dim text-center mb-4">이미지를 클릭하면 다운로드할 수 있습니다</p>

      {/* 위젯 HTML */}
      <div className="mb-4">
        <p className="text-[11px] font-semibold text-dim mb-1.5">위젯 HTML</p>
        <div className="relative">
          <code className="block bg-bg border border-border rounded-lg p-3 text-[11px] text-dim font-mono break-all leading-relaxed select-all">
            {embedHtml}
          </code>
          <CopyButton text={embedHtml} />
        </div>
      </div>

      {/* 블로그 해시태그 */}
      <div>
        <p className="text-[11px] font-semibold text-dim mb-1.5">블로그 해시태그</p>
        <div className="relative">
          <div className="bg-bg border border-border rounded-lg p-3 text-sm text-accent font-semibold select-all">
            {blogHashtag}
          </div>
          <CopyButton text={blogHashtag} />
        </div>
      </div>

      <p className="text-[10px] text-dim leading-relaxed mt-3">* 위젯은 매일 자동으로 업데이트됩니다.</p>
    </GlassCard>
  );
}
