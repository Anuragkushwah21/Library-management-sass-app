import { Suspense } from 'react';
import type { Metadata } from 'next';
import { Loader2 } from 'lucide-react';
import { CheckinFlow } from './checkin-flow';

export const metadata: Metadata = {
  title: 'Check in',
  // Signed per-library links — keep them out of search engines
  robots: { index: false, follow: false },
};

export default function CheckinPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-dvh items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      }
    >
      <CheckinFlow />
    </Suspense>
  );
}
