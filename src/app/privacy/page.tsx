import PrivacyContent from '@/components/legal/PrivacyContent';

export const metadata = {
  title: '개인정보처리방침 - N인플',
};

export default function PrivacyPage() {
  return (
    <div className="max-w-3xl mx-auto space-y-8">
      <h1 className="text-2xl font-extrabold">개인정보처리방침</h1>
      <div className="bg-surface rounded-2xl border border-border p-6 md:p-8">
        <PrivacyContent />
      </div>
    </div>
  );
}
