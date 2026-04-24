import type { Metadata } from 'next';
import ChatbookClient from './ChatbookClient';

export const metadata: Metadata = {
  title: '캐릭터챗북 — N인플',
  description: '셜록 홈즈·홍길동 같은 저작권 만료 고전 캐릭터와 대화하며 블로그 콘텐츠 아이디어와 글감을 발굴하세요.',
  openGraph: {
    title: '캐릭터챗북 — N인플',
    description: '고전 캐릭터와 대화하며 블로그 콘텐츠 아이디어를 얻는 도구.',
  },
};

export default function ChatbookPage() {
  return <ChatbookClient />;
}
