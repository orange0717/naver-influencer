'use client';

import Link from 'next/link';

interface Notice {
  id: number;
  title: string;
  date: string;
  content: string;
  tag: '공지' | '업데이트' | '이벤트';
}

const notices: Notice[] = [
  {
    id: 1,
    title: 'N인플 서비스 오픈!',
    date: '2025-03-14',
    content: 'N인플이 정식 오픈되었습니다. 네이버 인플루언서 순위, 키워드 분석, 경쟁사 비교 등 다양한 기능을 제공합니다.',
    tag: '공지',
  },
  {
    id: 2,
    title: '인플루언서 순위 위젯 기능 추가',
    date: '2025-03-14',
    content: '블로그에 임베드할 수 있는 순위 위젯이 추가되었습니다. 마이페이지에서 위젯 코드를 복사하여 사용하세요.',
    tag: '업데이트',
  },
  {
    id: 3,
    title: '검색량 조회 기능 오픈',
    date: '2025-03-14',
    content: '네이버 키워드별 월간 검색량을 조회할 수 있는 기능이 추가되었습니다.',
    tag: '업데이트',
  },
];

const tagColor: Record<string, string> = {
  '공지': 'bg-accent/15 text-accent',
  '업데이트': 'bg-up/15 text-up',
  '이벤트': 'bg-[#F29C68]/15 text-[#F29C68]',
};

export default function NoticePage() {
  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">공지사항</h1>
        <p className="text-sm text-dim">총 {notices.length}건</p>
      </div>

      <div className="space-y-3">
        {notices.map((notice) => (
          <div
            key={notice.id}
            className="bg-surface rounded-xl border border-border p-5 hover:border-accent/30 transition"
          >
            <div className="flex items-center gap-2 mb-2">
              <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${tagColor[notice.tag]}`}>
                {notice.tag}
              </span>
              <span className="text-xs text-dim">{notice.date}</span>
            </div>
            <h2 className="font-bold text-base mb-2">{notice.title}</h2>
            <p className="text-sm text-dim leading-relaxed">{notice.content}</p>
          </div>
        ))}
      </div>

      {notices.length === 0 && (
        <div className="text-center py-20 text-dim text-sm">
          아직 공지사항이 없습니다.
        </div>
      )}
    </div>
  );
}
