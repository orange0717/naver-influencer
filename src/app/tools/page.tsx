import Link from 'next/link';

/**
 * 블로그 도구 소개 페이지
 * 협력사 블로그 관련 도구들을 글 형태로 소개
 */

interface ToolArticle {
  id: string;
  name: string;
  tagline: string;
  url: string;
  icon: string;
  badge?: string;
  description: string[];   // 본문 단락들
  features: string[];       // 주요 기능 리스트
  recommended: string;      // 추천 대상
  isOwn?: boolean;          // 자사 서비스 여부
}

const TOOLS: ToolArticle[] = [
  {
    id: 'orangerefine',
    name: 'OrangeRefine',
    tagline: 'AI 맞춤법 · 교정 · 교열 · 윤문',
    url: 'https://orangerefine.kr',
    icon: '✍️',
    badge: '자사 서비스',
    isOwn: true,
    description: [
      '블로그 글을 발행하기 전, 맞춤법과 문장을 한 번에 검수할 수 있는 AI 교정 플랫폼입니다.',
      '단순 맞춤법 검사를 넘어 교정 · 교열 · 윤문 3단계로 글의 완성도를 높여줍니다. 체험단이나 협찬 원고를 납품하기 전 최종 검수 도구로 활용하면 신뢰도 있는 글을 완성할 수 있습니다.',
    ],
    features: [
      'AI 3단계 교정 (교정 → 교열 → 윤문)',
      '맞춤법 · 띄어쓰기 자동 검사',
      '글자수 세기 · 표절 체크',
      'AI 작성 탐지 기능',
      '가입 시 10,000文 무료 지급',
    ],
    recommended: '체험단 · 협찬 블로거, 원고 납품 전 최종 검수가 필요한 분',
  },
  // ─── 협력사 도구들은 여기에 추가 ───
  // 아래는 예시입니다. 실제 협력사 정보로 교체해주세요.
  //
  // {
  //   id: 'tool-example',
  //   name: '도구 이름',
  //   tagline: '한 줄 소개',
  //   url: 'https://example.com',
  //   icon: '🔧',
  //   description: [
  //     '첫 번째 단락...',
  //     '두 번째 단락...',
  //   ],
  //   features: ['기능 1', '기능 2', '기능 3'],
  //   recommended: '추천 대상 설명',
  // },
];

export default function ToolsPage() {
  return (
    <div className="space-y-10 max-w-3xl mx-auto">
      {/* 헤더 */}
      <div className="text-center pt-4">
        <p className="text-xs text-accent font-semibold tracking-widest mb-3">TOOLS</p>
        <h1 className="font-title text-2xl md:text-3xl font-extrabold text-text mb-3">
          블로거를 위한 추천 도구
        </h1>
        <p className="text-sm text-dim leading-relaxed">
          블로그 운영에 도움이 되는 도구들을 직접 사용해보고 소개합니다.
        </p>
      </div>

      {/* 도구 글 목록 */}
      {TOOLS.map((tool, index) => (
        <article key={tool.id} className="bg-surface rounded-2xl border border-border overflow-hidden">
          {/* 도구 헤더 */}
          <div className="px-6 py-5 border-b border-border/50 bg-bg/30">
            <div className="flex items-start gap-4">
              <span className="text-3xl mt-0.5">{tool.icon}</span>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap mb-1">
                  <h2 className="text-lg font-extrabold text-text">{tool.name}</h2>
                  {tool.badge && (
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                      tool.isOwn
                        ? 'text-accent bg-accent/10'
                        : 'text-blue bg-blue/10'
                    }`}>
                      {tool.badge}
                    </span>
                  )}
                </div>
                <p className="text-sm text-dim">{tool.tagline}</p>
              </div>
              <a
                href={tool.url}
                target="_blank"
                rel="noopener noreferrer"
                className="shrink-0 px-4 py-2 bg-accent text-white text-xs font-bold rounded-lg hover:bg-accent-hover transition hidden sm:block"
              >
                방문하기 →
              </a>
            </div>
          </div>

          {/* 본문 */}
          <div className="px-6 py-5 space-y-6">
            {/* 글 내용 */}
            <div className="space-y-3">
              {tool.description.map((para, i) => (
                <p key={i} className="text-sm text-text leading-relaxed">
                  {para}
                </p>
              ))}
            </div>

            {/* 주요 기능 */}
            {tool.features.length > 0 && (
              <div>
                <h3 className="text-sm font-bold text-text mb-3">주요 기능</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {tool.features.map((feat, i) => (
                    <div key={i} className="flex items-center gap-2 text-sm text-dim">
                      <span className="text-accent text-xs">✓</span>
                      {feat}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* 추천 대상 */}
            <div className="bg-bg rounded-xl p-4">
              <p className="text-xs text-dim mb-1 font-semibold">추천 대상</p>
              <p className="text-sm text-text">{tool.recommended}</p>
            </div>

            {/* 모바일 CTA */}
            <a
              href={tool.url}
              target="_blank"
              rel="noopener noreferrer"
              className="block sm:hidden w-full py-3 bg-accent text-white text-sm font-bold rounded-xl hover:bg-accent-hover transition text-center"
            >
              {tool.name} 방문하기 →
            </a>
          </div>

          {/* 구분선 (마지막 아이템 제외) */}
          {index < TOOLS.length - 1 && <div className="h-0" />}
        </article>
      ))}

      {/* 도구가 없을 때 */}
      {TOOLS.length === 0 && (
        <div className="text-center py-20 text-dim text-sm">
          <p>준비 중입니다.</p>
        </div>
      )}

      {/* 하단 안내 */}
      <div className="text-center pb-4">
        <p className="text-xs text-dim">
          도구 제휴 · 소개 문의:{' '}
          <a href="mailto:orange@orangelibrary.co.kr" className="text-accent hover:underline">
            orange@orangelibrary.co.kr
          </a>
        </p>
      </div>
    </div>
  );
}
