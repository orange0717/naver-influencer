import Link from 'next/link';
import { PLAN_LABEL, SUBSCRIBE_PATH, lockedMessage, type PlanKey } from '@/lib/plans';

/**
 * 등급 부족 안내 카드. 서버 컴포넌트에서도 쓰려고 클라이언트 훅에 의존하지 않는다.
 * FeatureGate(클라이언트)와 이 카드가 같은 모양을 쓰도록 여기 하나만 둔다.
 */
export default function FeatureLocked({ required }: { required: PlanKey }) {
  return (
    <div className="max-w-md mx-auto my-10 rounded-2xl border border-border bg-surface px-7 py-9 text-center shadow-sm">
      <h2 className="text-lg font-extrabold text-text mb-2">
        {PLAN_LABEL[required]} 이용권 기능입니다
      </h2>
      <p className="text-sm text-dim leading-relaxed">{lockedMessage(required)}</p>
      <Link
        href={`${SUBSCRIBE_PATH}?required=${required.toLowerCase()}`}
        className="mt-6 inline-flex items-center justify-center rounded-lg bg-accent px-5 py-2.5 text-sm font-bold text-white hover:bg-accent-hover transition-colors"
      >
        이용권 보기
      </Link>
    </div>
  );
}
