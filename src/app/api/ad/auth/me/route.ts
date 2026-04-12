import { NextRequest, NextResponse } from 'next/server';
import { getAdvertiserUser } from '@/lib/ad-auth';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const auth = await getAdvertiserUser(request);

  if (!auth) {
    return NextResponse.json({ type: null, id: null, companyName: null, contactName: null, email: null });
  }

  return NextResponse.json({
    type: 'advertiser',
    id: auth.advertiserId,
    companyName: auth.advertiser.company_name,
    contactName: auth.advertiser.contact_name,
    email: auth.advertiser.contact_email,
  });
}
