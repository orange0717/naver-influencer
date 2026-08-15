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
      className="fixed bottom-6 right-6 z-50 flex cursor-pointer items-center justify-center border border-border bg-surface text-text-2 transition-colors hover:text-text hover:bg-surface-hover"
      style={{
        height: '38px',
        padding: '0 16px',
        fontSize: '13px',
        letterSpacing: '-0.2px',
        borderRadius: '8px',
        boxShadow: '0 2px 8px rgba(36,35,31,0.08)',
      }}
    >
      <span style={{ lineHeight: 1 }}>고객센터</span>
    </a>
  );
}
