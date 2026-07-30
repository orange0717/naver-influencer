import { Suspense } from 'react';
import LinkInfluencerClient from './LinkInfluencerClient';

export default function LinkInfluencerPage() {
  return (
    <Suspense>
      <LinkInfluencerClient />
    </Suspense>
  );
}
