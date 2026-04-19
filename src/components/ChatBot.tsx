'use client';

// 네이버 톡톡 고객 문의 링크 (클릭 시 새 창으로 바로 이동)
const NAVER_TALK_URL = 'https://talk.naver.com/w4bz2x';

export default function ChatBot() {
  return (
    <a
      href={NAVER_TALK_URL}
      target="_blank"
      rel="noopener noreferrer"
      aria-label="네이버 톡톡으로 고객센터 문의"
      title="네이버 톡톡으로 고객센터 문의"
      className="fixed bottom-6 right-6 text-white shadow-lg hover:scale-105 transition-all z-50 flex items-center justify-center font-bold cursor-pointer"
      style={{
        backgroundColor: '#BF8984',
        height: '48px',
        padding: '0 22px',
        fontSize: '14px',
        letterSpacing: '-0.3px',
        borderRadius: '999px',
        boxShadow: '0 4px 14px rgba(0,0,0,0.2)',
      }}
    >
      <span style={{ lineHeight: 1 }}>고객센터</span>
    </a>
  );
}
