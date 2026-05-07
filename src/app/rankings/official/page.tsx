import { redirect } from 'next/navigation';

export const metadata = { title: '랭킹 — N인플' };

export default function OfficialRankingPage() {
  redirect('/dashboard');
}
