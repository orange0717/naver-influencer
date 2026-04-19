'use client';

// 네이버 톡톡 고객 문의 링크 (클릭 시 새 창으로 바로 이동)
const NAVER_TALK_URL = 'https://talk.naver.com/w4bz2x';

export default function ChatBot() {
  return (
    <a
      href={NAVER_TALK_URL}
      target="_blank"
      rel="noopener noreferrer"
      aria-label="네이버 톡톡으로 문의하기"
      title="네이버 톡톡으로 문의하기"
      className="fixed bottom-6 right-6 bg-accent text-white rounded-full shadow-lg hover:bg-accent-hover hover:scale-105 transition-all z-50 flex items-center justify-center cursor-pointer"
      style={{ width: '52px', height: '52px' }}
    >
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" />
      </svg>
    </a>
  );
}
