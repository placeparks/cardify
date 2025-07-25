'use client';

import dynamic from 'next/dynamic';

const RedeemClient = dynamic(() => import('./RedeemClient'), { ssr: false });

export default function Page() {
  return <RedeemClient />;
}
