'use client';

import { useEffect, useMemo, useState } from 'react';

/**
 * 블로그 도구 소개 페이지
 * 협력사 블로그 관련 도구들을 카드 그리드로 소개 + 즐겨찾기
 */

interface ToolArticle {
  id: string;
  name: string;
  tagline: string;
  url: string;
  icon?: string;
  badge?: string;
  category: string;          // 카테고리 (글쓰기 / 분석 / 이미지 / 마케팅 등)
  description: string[];     // 본문 단락들
  features: string[];        // 주요 기능 리스트
  recommended: string;       // 추천 대상
  isOwn?: boolean;           // 자사 서비스 여부
}

const TOOLS: ToolArticle[] = [
  {
    id: 'orangerefine',
    name: 'OrangeRefine',
    tagline: 'AI 맞춤법 · 교정 · 교열 · 윤문',
    url: 'https://orangerefine.kr',
    icon: '✍️',
    badge: '자사 서비스',
    category: '글쓰기',
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
  {
    id: 'image-converter',
    name: 'JPG ↔ PNG 변환기',
    tagline: '이미지 포맷 대량 변환 (최대 20장)',
    url: '/image-converter',
    icon: '🖼️',
    badge: '자사 도구',
    category: '이미지',
    isOwn: true,
    description: [
      'JPG를 PNG로, PNG를 JPG로 간편하게 변환하는 도구입니다.',
      '최대 20장까지 한 번에 처리 가능하며, 높은 품질(95% 압축률)로 유지됩니다. 이미지 최적화나 포맷 변환이 필요할 때 유용합니다.',
    ],
    features: [
      '최대 20장 일괄 변환',
      'JPG ↔ PNG 상호 변환',
      '높은 품질 유지 (95% 압축률)',
      '즉시 다운로드 가능',
      '별도의 가입 불필요',
    ],
    recommended: '블로그 이미지 포맷 변환이 필요한 블로거, 빠른 이미지 처리가 필요한 분',
  },
  // ─── 협력사 도구들은 여기에 추가 ───
];

const FAVORITES_KEY = 'ninfl-tool-favorites';
const BASE_TABS = ['전체', '즐겨찾기'] as const;

export default function ToolsPage() {
  const [activeTab, setActiveTab] = useState<string>('전체');
  const [favorites, setFavorites] = useState<string[]>([]);
  const [selectedTool, setSelectedTool] = useState<ToolArticle | null>(null);

  // 초기 즐겨찾기 로드
  useEffect(() => {
    try {
      const raw = localStorage.getItem(FAVORITES_KEY);
      if (raw) setFavorites(JSON.parse(raw));
    } catch {}
  }, []);

  // 즐겨찾기 변경 시 저장
  useEffect(() => {
    try {
      localStorage.setItem(FAVORITES_KEY, JSON.stringify(favorites));
    } catch {}
  }, [favorites]);

  // 탭: 전체 / 즐겨찾기
  const categoryTabs = useMemo(() => [...BASE_TABS], []);

  // 현재 탭 필터링
  const filteredTools = useMemo(() => {
    if (activeTab === '즐겨찾기') return TOOLS.filter((t) => favorites.includes(t.id));
    return TOOLS;
  }, [activeTab, favorites]);

  const toggleFavorite = (id: string) => {
    setFavorites((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  return (
    <div className="space-y-8 max-w-6xl mx-auto">
      {/* 헤더 */}
      <div className="text-center pt-4">
        <p className="text-xs text-accent font-semibold tracking-widest mb-3">TOOLS</p>
        <h1 className="font-title text-2xl md:text-3xl font-extrabold text-text mb-3">
          도구 목록
        </h1>
        <p className="text-sm text-dim leading-relaxed">
          블로그 운영에 도움이 되는 도구들을 모아봤습니다. 즐겨찾는 도구는 별표로 표시해두세요.
        </p>
      </div>

      {/* 탭 */}
      <div className="flex flex-wrap gap-2 justify-center">
        {categoryTabs.map((tab) => {
          const isActive = activeTab === tab;
          return (
            <button
              key={tab}
              type="button"
              onClick={() => setActiveTab(tab)}
              className={`px-4 py-2 rounded-full text-sm font-semibold transition border ${
                isActive
                  ? 'bg-accent text-white border-accent'
                  : 'bg-surface text-text border-border hover:border-accent/60'
              }`}
            >
              {tab === '즐겨찾기' ? `★ ${tab}` : tab}
              {tab === '즐겨찾기' && favorites.length > 0 && (
                <span className={`ml-1.5 text-[11px] ${isActive ? 'text-white/80' : 'text-dim'}`}>
                  {favorites.length}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* 카드 그리드 */}
      {filteredTools.length > 0 ? (
        <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3 sm:gap-4">
          {filteredTools.map((tool) => {
            const isFav = favorites.includes(tool.id);
            return (
              <article
                key={tool.id}
                className="relative bg-surface rounded-2xl border border-border hover:border-accent/60 transition overflow-hidden flex flex-col"
              >
                {/* 즐겨찾기 별 */}
                <button
                  type="button"
                  onClick={() => toggleFavorite(tool.id)}
                  aria-label={isFav ? '즐겨찾기 해제' : '즐겨찾기 추가'}
                  aria-pressed={isFav}
                  className={`absolute top-3 right-3 w-8 h-8 flex items-center justify-center rounded-full text-lg transition z-10 ${
                    isFav
                      ? 'text-yellow-400 hover:bg-yellow-400/10'
                      : 'text-dim hover:text-yellow-400 hover:bg-bg'
                  }`}
                >
                  {isFav ? '★' : '☆'}
                </button>

                <button
                  type="button"
                  onClick={() => setSelectedTool(tool)}
                  className="text-left px-5 pt-5 pb-4 flex-1 flex flex-col"
                >
                  <div className="flex items-center gap-2 mb-2 pr-8">
                    {tool.icon && <span className="text-2xl">{tool.icon}</span>}
                    {tool.badge && (
                      <span
                        className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                          tool.isOwn
                            ? 'text-accent bg-accent/10'
                            : 'text-blue bg-blue/10'
                        }`}
                      >
                        {tool.badge}
                      </span>
                    )}
                  </div>
                  <h2 className="text-base font-extrabold text-text mb-1 pr-8">
                    {tool.name}
                  </h2>
                  <p className="text-xs text-dim leading-relaxed mb-3 line-clamp-2">
                    {tool.tagline}
                  </p>
                  <span className="mt-auto inline-block text-[11px] text-dim">
                    {tool.category}
                  </span>
                </button>

                <a
                  href={tool.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block text-center text-xs font-bold py-2.5 bg-accent/10 text-accent hover:bg-accent hover:text-white transition border-t border-border"
                >
                  방문하기 →
                </a>
              </article>
            );
          })}
        </div>
      ) : (
        <div className="text-center py-20 text-dim text-sm">
          {activeTab === '즐겨찾기' ? (
            <p>즐겨찾기한 도구가 없습니다. 카드의 별표를 눌러 추가해보세요.</p>
          ) : (
            <p>준비 중입니다.</p>
          )}
        </div>
      )}

      {/* 상세 모달 */}
      {selectedTool && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
          onClick={() => setSelectedTool(null)}
        >
          <div
            className="bg-surface rounded-2xl border border-border max-w-lg w-full max-h-[85vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-6 py-5 border-b border-border/50 bg-bg/30 flex items-start gap-3">
              {selectedTool.icon && <span className="text-3xl mt-0.5">{selectedTool.icon}</span>}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap mb-1">
                  <h2 className="text-lg font-extrabold text-text">{selectedTool.name}</h2>
                  {selectedTool.badge && (
                    <span
                      className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                        selectedTool.isOwn
                          ? 'text-accent bg-accent/10'
                          : 'text-blue bg-blue/10'
                      }`}
                    >
                      {selectedTool.badge}
                    </span>
                  )}
                </div>
                <p className="text-sm text-dim">{selectedTool.tagline}</p>
              </div>
              <button
                type="button"
                onClick={() => setSelectedTool(null)}
                className="text-dim hover:text-text text-xl leading-none"
                aria-label="닫기"
              >
                ×
              </button>
            </div>

            <div className="px-6 py-5 space-y-5">
              <div className="space-y-3">
                {selectedTool.description.map((para, i) => (
                  <p key={i} className="text-sm text-text leading-relaxed">
                    {para}
                  </p>
                ))}
              </div>

              {selectedTool.features.length > 0 && (
                <div>
                  <h3 className="text-sm font-bold text-text mb-3">주요 기능</h3>
                  <div className="grid grid-cols-1 gap-2">
                    {selectedTool.features.map((feat, i) => (
                      <div key={i} className="flex items-center gap-2 text-sm text-dim">
                        <span className="text-accent text-xs">✓</span>
                        {feat}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="bg-bg rounded-xl p-4">
                <p className="text-xs text-dim mb-1 font-semibold">추천 대상</p>
                <p className="text-sm text-text">{selectedTool.recommended}</p>
              </div>

              <a
                href={selectedTool.url}
                target="_blank"
                rel="noopener noreferrer"
                className="block w-full py-3 bg-accent text-white text-sm font-bold rounded-xl hover:bg-accent-hover transition text-center"
              >
                {selectedTool.name} 방문하기 →
              </a>
            </div>
          </div>
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
