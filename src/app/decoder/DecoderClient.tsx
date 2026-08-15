'use client';

import { useEffect, useMemo, useState } from 'react';
import { SM_TABLE, STRENGTH_META, TRACKING_TABLE, WHERE_TABLE, decode, summarize, analyzeBatch, EXAMPLES, BATCH_SAMPLE } from './DecoderClient.helpers';
import { Section, Field, DistroCard } from './DecoderClient.components';

type Mode = 'single' | 'batch';

interface DecoderClientProps {
  initialUrl?: string;
}

export default function DecoderClient({ initialUrl = '' }: DecoderClientProps) {
  const [mode, setMode] = useState<Mode>('single');
  const [input, setInput] = useState(initialUrl);
  const [batchInput, setBatchInput] = useState('');
  const [shareCopied, setShareCopied] = useState(false);

  // initialUrl이 있으면 단건 모드 자동 진입
  useEffect(() => {
    if (initialUrl) {
      setMode('single');
      setInput(initialUrl);
    }
  }, [initialUrl]);

  const decoded = useMemo(() => (input.trim() ? decode(input) : null), [input]);
  const intent = useMemo(() => (decoded ? summarize(decoded) : null), [decoded]);

  const ref = decoded?.topRefererDecoded;
  const refSmInfo = ref?.smCode ? SM_TABLE[ref.smCode] : undefined;
  const ownSmInfo = decoded?.smCode ? SM_TABLE[decoded.smCode] : undefined;
  const smInfo = refSmInfo || ownSmInfo;
  const smCode = ref?.smCode || decoded?.smCode;

  const batch = useMemo(() => (batchInput.trim() ? analyzeBatch(batchInput) : null), [batchInput]);

  const shareUrl = useMemo(() => {
    if (!input.trim() || typeof window === 'undefined') return '';
    const params = new URLSearchParams({ url: input });
    return `${window.location.origin}/decoder?${params.toString()}`;
  }, [input]);

  const handleShare = async () => {
    if (!shareUrl) return;
    try {
      await navigator.clipboard.writeText(shareUrl);
      setShareCopied(true);
      setTimeout(() => setShareCopied(false), 2000);
    } catch {}
  };

  return (
    <div className="space-y-8 max-w-4xl mx-auto">
      {/* 헤더 */}
      <div className="text-center pt-4">
        <p className="text-xs text-accent font-semibold tracking-widest mb-3">URL DECODER</p>
        <h1 className="type-page-title text-text mb-3">
          네이버 URL 디코더
        </h1>
        <p className="text-sm text-dim leading-relaxed">
          블로그 통계의 알 수 없는 referer URL을 붙여넣으면<br className="md:hidden" />
          어떤 검색에서, 어떤 방식으로 들어왔는지 한 줄로 해석해 드립니다.
        </p>
      </div>

      {/* 모드 탭 */}
      <div className="flex gap-2 justify-center">
        {(
          [
            { key: 'single', label: '단건 분석', desc: 'URL 1개' },
            { key: 'batch', label: '일괄 분석', desc: '여러 개 통계' },
          ] as Array<{ key: Mode; label: string; desc: string }>
        ).map((tab) => {
          const active = mode === tab.key;
          return (
            <button
              key={tab.key}
              type="button"
              onClick={() => setMode(tab.key)}
              className={`px-4 py-2 rounded-full text-sm font-semibold transition border ${
                active
                  ? 'bg-accent text-white border-accent'
                  : 'bg-surface text-text border-border hover:border-accent/60'
              }`}
            >
              {tab.label}
              <span className={`ml-2 text-[10px] ${active ? 'text-white/80' : 'text-dim'}`}>
                {tab.desc}
              </span>
            </button>
          );
        })}
      </div>

      {/* 단건 모드 */}
      {mode === 'single' && (
        <>
          <div className="bg-surface rounded-lg border border-border p-5 space-y-3">
            <label className="block text-xs font-semibold text-dim">분석할 URL</label>
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              rows={3}
              placeholder="https://blog.naver.com/... 또는 https://search.naver.com/... 형태의 URL을 붙여넣으세요"
              className="w-full px-3 py-2.5 text-sm font-mono bg-bg border border-border rounded-xl focus:outline-none focus:border-accent/60 resize-none break-all"
            />

            <div className="flex flex-wrap gap-2 pt-1 items-center">
              <span className="text-[11px] text-dim">예시:</span>
              {EXAMPLES.map((ex) => (
                <button
                  key={ex.label}
                  type="button"
                  onClick={() => setInput(ex.url)}
                  className="text-[11px] px-2.5 py-1 rounded-full bg-bg border border-border text-dim hover:border-accent/60 hover:text-accent transition"
                >
                  {ex.label}
                </button>
              ))}
              {input && (
                <div className="flex gap-2 ml-auto">
                  <button
                    type="button"
                    onClick={handleShare}
                    className="text-[11px] px-2.5 py-1 rounded-full bg-accent/10 border border-accent/20 text-accent hover:bg-accent hover:text-white transition"
                  >
                    {shareCopied ? '✓ 복사됨' : '🔗 분석 링크 복사'}
                  </button>
                  <button
                    type="button"
                    onClick={() => setInput('')}
                    className="text-[11px] px-2.5 py-1 rounded-full bg-bg border border-border text-dim hover:text-down transition"
                  >
                    지우기
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* 결과 */}
          {decoded && (
            <div className="space-y-5">
              {intent && (
                <div className="bg-surface rounded-lg border border-border p-6 space-y-4">
                  <div className="flex flex-wrap items-center gap-3">
                    <span className={`inline-flex items-center gap-1.5 text-sm font-bold px-3 py-1.5 rounded-full border ${intent.cls}`}>
                      <span className="text-base">{intent.icon}</span>
                      {intent.label}
                    </span>
                    {smInfo && (
                      <span className={`text-[11px] font-semibold px-2 py-1 rounded-full ${STRENGTH_META[smInfo.strength].cls}`}>
                        {STRENGTH_META[smInfo.strength].label}
                      </span>
                    )}
                  </div>
                  <p className="text-base text-text leading-relaxed font-medium">
                    {intent.sentence}
                  </p>
                  {!decoded.valid && decoded.error && (
                    <p className="text-xs text-down">{decoded.error}</p>
                  )}
                </div>
              )}

              {decoded.valid && (
                <div className="bg-surface rounded-lg border border-border overflow-hidden">
                  <div className="px-5 py-3 border-b border-border/50 bg-bg/30">
                    <h2 className="text-sm font-bold text-text">상세 분석</h2>
                  </div>

                  <div className="divide-y divide-border/50">
                    <Section title="진입 페이지">
                      <Field label="화면" value={decoded.surface} />
                      <Field label="도메인" value={decoded.hostname} mono />
                      <Field label="경로" value={decoded.pathname} mono />
                      {decoded.blogId && <Field label="블로그 ID" value={decoded.blogId} mono />}
                      {decoded.logNo && <Field label="포스트 번호 (logNo)" value={decoded.logNo} mono />}
                      {decoded.directoryNo !== undefined && (
                        <Field
                          label="카테고리 (directoryNo)"
                          value={`${decoded.directoryNo}${decoded.directoryNo === '0' ? ' · 전체' : ''}`}
                        />
                      )}
                      {decoded.groupId !== undefined && (
                        <Field
                          label="그룹 (groupId)"
                          value={`${decoded.groupId}${decoded.groupId === '0' ? ' · 전체' : ''}`}
                        />
                      )}
                      {decoded.pageNo && !ref?.query && !decoded.query && (
                        <Field label="페이지" value={`${decoded.pageNo}페이지`} />
                      )}
                      {decoded.directAccess && (
                        <Field label="directAccess" value="true (검색 결과 블로그 영역에서 직접 클릭)" />
                      )}
                      {decoded.trackingCode && (
                        <Field
                          label="trackingCode"
                          value={`${decoded.trackingCode} ${TRACKING_TABLE[decoded.trackingCode] ? `· ${TRACKING_TABLE[decoded.trackingCode]}` : ''}`}
                        />
                      )}
                    </Section>

                    {(ref?.query || decoded.query) && (
                      <Section title="검색 정보">
                        <Field
                          label={`검색어${(ref?.queryParam || decoded.queryParam) && (ref?.queryParam || decoded.queryParam) !== 'query' ? ` (${ref?.queryParam || decoded.queryParam} 파라미터)` : ''}`}
                          value={ref?.query || decoded.query}
                          highlight
                        />
                        {(ref?.where || decoded.where) && (
                          <Field
                            label="where"
                            value={`${ref?.where || decoded.where} ${WHERE_TABLE[ref?.where || decoded.where || ''] ? `· ${WHERE_TABLE[ref?.where || decoded.where || '']}` : ''}`}
                          />
                        )}
                        {smCode && (
                          <Field
                            label="sm 코드"
                            value={`${smCode} ${smInfo ? `· ${smInfo.label}` : '· 알 수 없음'}`}
                          />
                        )}
                        {(ref?.pageNo || decoded.pageNo) && (
                          <Field label="페이지" value={`${ref?.pageNo || decoded.pageNo}페이지`} />
                        )}
                        {(ref?.orderBy || decoded.orderBy) && (
                          <Field label="정렬" value={ref?.orderBy || decoded.orderBy} />
                        )}
                        {(ref?.range || decoded.range) && (
                          <Field label="기간" value={ref?.range || decoded.range} />
                        )}
                        {(ref?.ackey || decoded.ackey) && (
                          <Field label="ackey" value={`${ref?.ackey || decoded.ackey} (검색 세션 식별자)`} mono />
                        )}
                      </Section>
                    )}

                    {decoded.topReferer && ref && (
                      <Section title="topReferer (이전 페이지)">
                        <Field label="화면" value={ref.surface} />
                        <Field label="도메인" value={ref.hostname} mono />
                        <details className="text-xs">
                          <summary className="cursor-pointer text-dim hover:text-accent">
                            디코딩된 원본 URL
                          </summary>
                          <p className="mt-2 p-2 bg-bg rounded text-[11px] font-mono break-all text-dim">
                            {ref.raw}
                          </p>
                        </details>
                      </Section>
                    )}

                    <Section title="원본 파라미터">
                      <details>
                        <summary className="text-xs text-dim hover:text-accent cursor-pointer">
                          모든 쿼리 파라미터 보기 ({decoded.rawParams.length}개)
                        </summary>
                        <div className="mt-3 space-y-1.5">
                          {decoded.rawParams.map((p, i) => (
                            <div key={i} className="flex gap-2 text-[11px] font-mono">
                              <span className="text-accent shrink-0 min-w-[110px]">{p.key}</span>
                              <span className="text-text break-all">{p.value}</span>
                            </div>
                          ))}
                        </div>
                      </details>
                    </Section>
                  </div>
                </div>
              )}
            </div>
          )}
        </>
      )}

      {/* 일괄 모드 */}
      {mode === 'batch' && (
        <>
          <div className="bg-surface rounded-lg border border-border p-5 space-y-3">
            <div className="flex items-baseline justify-between">
              <label className="block text-xs font-semibold text-dim">
                URL 목록 (한 줄에 하나씩)
              </label>
              <button
                type="button"
                onClick={() => setBatchInput(BATCH_SAMPLE)}
                className="text-[11px] px-2.5 py-1 rounded-full bg-bg border border-border text-dim hover:border-accent/60 hover:text-accent transition"
              >
                샘플 데이터로 채우기
              </button>
            </div>
            <textarea
              value={batchInput}
              onChange={(e) => setBatchInput(e.target.value)}
              rows={10}
              placeholder={`네이버 블로그 통계의 referer URL을 한 줄에 하나씩 붙여넣으세요.\n\nhttps://blog.naver.com/...\nhttps://blog.naver.com/...\nhttps://search.naver.com/...`}
              className="w-full px-3 py-2.5 text-xs font-mono bg-bg border border-border rounded-xl focus:outline-none focus:border-accent/60 resize-y break-all"
            />
            {batchInput && (
              <div className="flex justify-end">
                <button
                  type="button"
                  onClick={() => setBatchInput('')}
                  className="text-[11px] px-2.5 py-1 rounded-full bg-bg border border-border text-dim hover:text-down transition"
                >
                  지우기
                </button>
              </div>
            )}
          </div>

          {batch && batch.total > 0 && (
            <div className="space-y-5">
              {/* 요약 헤더 */}
              <div className="bg-surface rounded-lg border border-border p-5 flex flex-wrap gap-4 items-center">
                <div>
                  <p className="text-xs text-dim">총 URL</p>
                  <p className="text-2xl font-extrabold text-text">{batch.total}</p>
                </div>
                <div>
                  <p className="text-xs text-dim">분석 성공</p>
                  <p className="text-2xl font-extrabold text-emerald-600">{batch.valid}</p>
                </div>
                {batch.invalid > 0 && (
                  <div>
                    <p className="text-xs text-dim">실패</p>
                    <p className="text-2xl font-extrabold text-rose-600">{batch.invalid}</p>
                  </div>
                )}
              </div>

              {/* 의도별 분포 */}
              <DistroCard
                title="의도별 분포"
                items={batch.intents.map((i) => ({
                  key: i.label,
                  left: (
                    <span className={`inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded border ${i.cls}`}>
                      {i.icon} {i.label}
                    </span>
                  ),
                  count: i.count,
                  ratio: i.ratio,
                }))}
              />

              {/* sm 코드별 분포 */}
              {batch.sms.length > 0 && (
                <DistroCard
                  title="🔑 sm 코드 분포 (브랜드 강도)"
                  items={batch.sms.map((s) => ({
                    key: s.code,
                    left: (
                      <span className="flex items-center gap-2">
                        <code className="font-mono text-xs text-accent">{s.code}</code>
                        <span className="text-xs text-text">{s.label}</span>
                        <span className={`text-[10px] px-1.5 py-0.5 rounded ${STRENGTH_META[s.strength].cls}`}>
                          {STRENGTH_META[s.strength].short}
                        </span>
                      </span>
                    ),
                    count: s.count,
                    ratio: s.ratio,
                  }))}
                />
              )}

              {/* 검색어 TOP */}
              {batch.queries.length > 0 && (
                <DistroCard
                  title={`🔍 검색어 TOP ${batch.queries.length}`}
                  items={batch.queries.map((q) => ({
                    key: q.query,
                    left: <span className="text-sm font-semibold text-text">{q.query}</span>,
                    count: q.count,
                    ratio: q.ratio,
                  }))}
                />
              )}

              {/* 화면별 분포 */}
              {batch.surfaces.length > 0 && (
                <DistroCard
                  title="📄 진입 화면 분포"
                  items={batch.surfaces.map((s) => ({
                    key: s.surface,
                    left: <span className="text-sm text-text">{s.surface}</span>,
                    count: s.count,
                    ratio: s.ratio,
                  }))}
                />
              )}

              {/* 전체 목록 */}
              <details className="bg-surface rounded-lg border border-border">
                <summary className="px-5 py-3 cursor-pointer text-sm font-bold text-text hover:bg-bg/30">
                  📋 전체 목록 ({batch.rows.length}개)
                </summary>
                <div className="border-t border-border/50 divide-y divide-border/30 max-h-96 overflow-y-auto">
                  {batch.rows.map((row, i) => (
                    <div key={i} className="px-5 py-3 text-xs space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-mono text-dim shrink-0">#{i + 1}</span>
                        <span className={`inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded border ${row.intent.cls}`}>
                          {row.intent.icon} {row.intent.label}
                        </span>
                        {row.smCode && (
                          <code className="text-[10px] font-mono text-accent">{row.smCode}</code>
                        )}
                        {row.query && (
                          <span className="text-[11px] text-text font-semibold">&quot;{row.query}&quot;</span>
                        )}
                      </div>
                      <p className="text-[10px] font-mono text-dim break-all line-clamp-2">{row.raw}</p>
                    </div>
                  ))}
                </div>
              </details>
            </div>
          )}
        </>
      )}

      {/* 도움말 */}
      <div className="bg-surface rounded-lg border border-border p-6 space-y-4">
        <h2 className="text-sm font-bold text-text">
          sm 코드로 보는 브랜드 강도
        </h2>
        <p className="text-xs text-dim leading-relaxed">
          네이버 검색창에 들어온 방식(<code className="text-accent">sm</code> 파라미터)은 사용자의 인지 강도를 보여주는 중요한 신호입니다.
          같은 검색어라도 <strong className="text-text">검색기록(top_hty)</strong>에서 들어온 비율이 높다면 충성도 높은 재방문자가 많다는 뜻입니다.
        </p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
          {Object.entries(SM_TABLE)
            .filter(([k]) => !k.startsWith('mtp_') && !k.startsWith('tab_'))
            .map(([code, info]) => (
              <div key={code} className="flex items-start gap-2 text-xs">
                <code className="font-mono text-accent shrink-0 min-w-[68px]">{code}</code>
                <span className="text-text">{info.label}</span>
                <span className={`ml-auto shrink-0 text-[10px] px-1.5 py-0.5 rounded ${STRENGTH_META[info.strength].cls}`}>
                  {STRENGTH_META[info.strength].short}
                </span>
              </div>
            ))}
        </div>
      </div>

      {/* 하단 CTA */}
      <div className="text-center pb-4">
        <p className="text-xs text-dim leading-relaxed">
          이 도구는 무료입니다. 키워드별 유입 패턴까지 한눈에 보고 싶다면<br />
          <a href="/subscribe" className="text-accent hover:underline font-semibold">
            네이버 인플루언서 키워드챌린지 대시보드
          </a>
          를 확인해 보세요.
        </p>
      </div>
    </div>
  );
}
