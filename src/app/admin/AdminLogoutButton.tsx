'use client';

import { useRouter } from 'next/navigation';

export default function AdminLogoutButton() {
  const router = useRouter();

  const handleLogout = async () => {
    await fetch('/api/auth/logout', { method: 'POST' });
    router.push('/');
  };

  return (
    <button
      onClick={handleLogout}
      className="px-4 py-1.5 text-xs font-semibold text-dim border border-border rounded-lg hover:text-text hover:border-text/30 transition"
    >
      로그아웃
    </button>
  );
}
