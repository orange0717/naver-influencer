import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';

export default async function LoginLayout({ children }: { children: React.ReactNode }) {
  const cookieStore = await cookies();
  const isDemo = cookieStore.get('demo_mode')?.value === 'true';
  const naverId = cookieStore.get('naver_id')?.value;

  // 데모 세션이 활성화되어 있으면 로그인 페이지를 보여주지 않고 /my로 이동
  if (isDemo && naverId) {
    redirect(`/my?demo=${naverId}`);
  }

  return <>{children}</>;
}
