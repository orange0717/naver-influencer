import { Suspense } from 'react';
import OnboardClient from './OnboardClient';

export default function OnboardPage() {
  return (
    <Suspense>
      <OnboardClient />
    </Suspense>
  );
}
