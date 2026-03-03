import { NextResponse } from 'next/server';

export async function GET() {
  // MVP: mock balance
  return NextResponse.json({
    balance: 1200,
    total_charged: 8000,
    total_used: 6800,
  });
}
