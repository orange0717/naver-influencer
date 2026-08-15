import type { Metadata } from 'next';
import AdSettlements from '@/components/dashboard/AdSettlements';

export const metadata: Metadata = {
  title: '원고료 정산내역 - N인플',
  description: '광고주 캠페인 집행에 따른 원고료 정산내역을 확인하세요.',
};

export default function SettlementsPage() {
  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div className="flex items-end justify-between gap-4">
        <div>
          <h1 className="font-title text-2xl font-extrabold">원고료 정산내역</h1>
          <p className="text-sm text-dim mt-1">광고주 캠페인 집행에 따른 원고료 정산내역</p>
        </div>
      </div>

      <div className="bg-surface rounded-lg border border-border p-5 md:p-6">
        <AdSettlements />
      </div>
    </div>
  );
}
