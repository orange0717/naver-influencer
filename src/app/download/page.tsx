import type { Metadata } from 'next';
import DownloadClient from './DownloadClient';

export const metadata: Metadata = {
  title: 'N인플 데스크탑 앱 다운로드',
  description:
    'N인플 데스크탑 앱(macOS / Windows / Linux)과 모바일 스토어 안내. 키워드 변동 알림을 즉시 받고, 브라우저 없이 빠르게 실행할 수 있습니다.',
  alternates: { canonical: 'https://ninfle.kr/download' },
  openGraph: {
    title: 'N인플 데스크탑 앱 다운로드',
    description: 'macOS / Windows / Linux 데스크탑 앱. 키워드 알림, 빠른 실행, 트레이 상주.',
    url: 'https://ninfle.kr/download',
  },
};

export default function DownloadPage() {
  return <DownloadClient />;
}
