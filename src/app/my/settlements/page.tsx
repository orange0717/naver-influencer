import type { Metadata } from 'next';
import AdSettlements from '@/components/dashboard/AdSettlements';

export const metadata: Metadata = {
  title: '원고료 정산내역 - N인플',
  description: '광고주 캠페인 집행에 따른 원고료 정산내역을 확인하세요.',
};

export default function SettlementsPage() {
  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div>
        <h1 className="font-title text-2xl font-extrabold">원고료 정산내역</h1>
        <p className="text-sm text-dim mt-1">광고주가 캠페인을 집행하면 자동으로 반영됩니다</p>
      </div>

      <div className="bg-surface rounded-2xl border border-border p-6">
        <AdSettlements />
      </div>
    </div>
  );
}
