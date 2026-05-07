import TermsContent from '@/components/legal/TermsContent';

export const metadata = {
  title: '이용약관 - N인플',
};

export default function TermsPage() {
  return (
    <div className="max-w-3xl mx-auto space-y-8">
      <h1 className="text-2xl font-extrabold">이용약관</h1>
      <div className="bg-surface rounded-2xl border border-border p-6 md:p-8">
        <TermsContent />
      </div>
    </div>
  );
}
