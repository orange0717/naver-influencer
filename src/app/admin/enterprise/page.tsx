'use client';

import { Fragment, useState, useEffect, useCallback } from 'react';
import {
  INQUIRY_STATUSES,
  companyTypeLabel,
  teamSizeLabel,
  inquiryStatusLabel,
} from '@/lib/enterprise-inquiry';

interface Inquiry {
  id: string;
  company_name: string;
  contact_name: string;
  contact_title: string | null;
  email: string;
  phone: string;
  company_type: string;
  team_size: string;
  interests: string[];
  message: string;
  status: string;
  admin_note: string | null;
  user_id: string | null;
  source_url: string | null;
  created_at: string;
  updated_at: string;
}

/** 진행 단계별 색 — 신규는 강조, 종료/보류는 흐리게 */
function statusToneClass(status: string): string {
  if (status === 'new') return 'bg-accent/15 text-accent';
  if (status === 'contracted') return 'bg-up/15 text-up';
  if (status === 'on_hold' || status === 'closed') return 'bg-border text-dim';
  return 'bg-surface-hover text-text-2';
}

export default function AdminEnterprisePage() {
  const [inquiries, setInquiries] = useState<Inquiry[]>([]);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [total, setTotal] = useState(0);
  const [statusFilter, setStatusFilter] = useState('');
  const [loading, setLoading] = useState(true);
  const [openId, setOpenId] = useState<string | null>(null);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [noteDraft, setNoteDraft] = useState('');
  /** 조회 자체가 실패했는가. '접수된 문의가 없다'와 반드시 구분해야 하는 상태다. */
  const [loadError, setLoadError] = useState('');

  // 실패를 삼키면 inquiries 가 [] 로 남아 "접수된 문의가 없습니다"가 뜬다. 들어온 문의를
  // 못 본 채로 "문의가 없구나" 하고 창을 닫게 되는 안내라 반드시 갈라야 한다.
  const fetchInquiries = useCallback(async () => {
    setLoading(true);
    setLoadError('');
    try {
      const qs = statusFilter ? `?status=${statusFilter}` : '';
      const res = await fetch(`/api/admin/enterprise-inquiries${qs}`);
      if (!res.ok) {
        setLoadError(`문의 목록을 불러오지 못했습니다. (오류 ${res.status})`);
        return;
      }
      const data = await res.json();
      setInquiries(data.inquiries || []);
      setCounts(data.counts || {});
      setTotal(data.total || 0);
    } catch {
      setLoadError('문의 목록을 불러오지 못했습니다. 네트워크 상태를 확인해 주세요.');
    } finally {
      setLoading(false);
    }
  }, [statusFilter]);

  useEffect(() => { fetchInquiries(); }, [fetchInquiries]);

  const patchInquiry = async (id: string, patch: { status?: string; adminNote?: string }) => {
    setSavingId(id);
    try {
      const res = await fetch(`/api/admin/enterprise-inquiries/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        alert(data.error || '변경에 실패했습니다.');
        return;
      }
      const { inquiry } = await res.json();
      setInquiries(prev => prev.map(row => (row.id === id ? { ...row, ...inquiry } : row)));
      if (patch.status) fetchInquiries();
    } finally {
      setSavingId(null);
    }
  };

  const toggleDetail = (row: Inquiry) => {
    if (openId === row.id) {
      setOpenId(null);
      return;
    }
    setOpenId(row.id);
    setNoteDraft(row.admin_note || '');
  };

  return (
    <div className="space-y-6">
      <h1 className="type-page-title">기업용 문의</h1>

      {/* 상태 필터 */}
      <div className="flex flex-wrap items-center gap-2">
        <button
          onClick={() => setStatusFilter('')}
          className={`h-8 px-3 rounded-lg text-xs font-semibold transition cursor-pointer ${
            statusFilter === '' ? 'bg-accent text-white' : 'bg-surface border border-border text-dim hover:text-text'
          }`}
        >
          전체 {total}
        </button>
        {INQUIRY_STATUSES.map(s => (
          <button
            key={s.value}
            onClick={() => setStatusFilter(s.value)}
            className={`h-8 px-3 rounded-lg text-xs font-semibold transition cursor-pointer ${
              statusFilter === s.value ? 'bg-accent text-white' : 'bg-surface border border-border text-dim hover:text-text'
            }`}
          >
            {s.label} {counts[s.value] || 0}
          </button>
        ))}
      </div>

      <div className="bg-surface rounded-lg border border-border overflow-x-auto">
        <div className="px-5 py-3 border-b border-border flex items-center justify-between">
          <h2 className="text-sm font-bold">문의 목록</h2>
          {/* 조회 실패 시 건수를 단언하지 않는다(0건은 '없다'로 읽힌다). */}
          <span className="text-xs text-dim">{loadError ? '—' : `${inquiries.length}건`}</span>
        </div>

        {loading ? (
          <div className="py-12 text-center">
            <div className="w-5 h-5 border-2 border-accent/30 border-t-accent rounded-full animate-spin mx-auto" />
          </div>
        ) : loadError ? (
          <div className="py-12 text-center space-y-3">
            <p className="text-sm text-down">{loadError}</p>
            <button type="button" onClick={fetchInquiries} className="text-sm text-accent hover:underline cursor-pointer">
              다시 시도
            </button>
          </div>
        ) : inquiries.length === 0 ? (
          <div className="py-12 text-center text-dim text-sm">접수된 문의가 없습니다.</div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-[11px] text-dim">
                <th className="text-left px-4 py-2.5 font-semibold">접수일</th>
                <th className="text-left px-4 py-2.5 font-semibold">회사명</th>
                <th className="text-left px-4 py-2.5 font-semibold">담당자</th>
                <th className="text-left px-4 py-2.5 font-semibold">기업 유형</th>
                <th className="text-left px-4 py-2.5 font-semibold">예상 인원</th>
                <th className="text-left px-4 py-2.5 font-semibold">상태</th>
                <th className="text-center px-4 py-2.5 font-semibold">상세</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/20">
              {inquiries.map(row => (
                <Fragment key={row.id}>
                  <tr className="hover:bg-surface-hover transition">
                    <td className="px-4 py-2.5 text-xs text-dim whitespace-nowrap">
                      {new Date(row.created_at).toLocaleDateString('ko-KR')}
                    </td>
                    <td className="px-4 py-2.5 font-semibold">{row.company_name}</td>
                    <td className="px-4 py-2.5">
                      {row.contact_name}
                      {row.contact_title && <span className="text-dim"> · {row.contact_title}</span>}
                    </td>
                    <td className="px-4 py-2.5 text-dim">{companyTypeLabel(row.company_type)}</td>
                    <td className="px-4 py-2.5 text-dim">{teamSizeLabel(row.team_size)}</td>
                    <td className="px-4 py-2.5">
                      <select
                        value={row.status}
                        disabled={savingId === row.id}
                        onChange={e => patchInquiry(row.id, { status: e.target.value })}
                        className={`h-8 px-2 rounded-lg border-0 text-xs font-semibold cursor-pointer disabled:opacity-50 ${statusToneClass(row.status)}`}
                      >
                        {INQUIRY_STATUSES.map(s => (
                          <option key={s.value} value={s.value}>{s.label}</option>
                        ))}
                      </select>
                    </td>
                    <td className="px-4 py-2.5 text-center">
                      <button
                        onClick={() => toggleDetail(row)}
                        className="px-3 py-1 bg-accent/10 text-accent font-bold rounded-lg text-xs hover:bg-accent/20 transition cursor-pointer"
                      >
                        {openId === row.id ? '닫기' : '보기'}
                      </button>
                    </td>
                  </tr>

                  {openId === row.id && (
                    <tr className="bg-bg">
                      <td colSpan={7} className="px-4 py-4">
                        <div className="space-y-3 text-sm">
                          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                            <div>
                              <p className="text-[11px] text-dim mb-0.5">이메일</p>
                              <a href={`mailto:${row.email}`} className="text-accent underline break-all">{row.email}</a>
                            </div>
                            <div>
                              <p className="text-[11px] text-dim mb-0.5">연락처</p>
                              <a href={`tel:${row.phone}`} className="text-accent underline">{row.phone}</a>
                            </div>
                            <div>
                              <p className="text-[11px] text-dim mb-0.5">현재 상태</p>
                              <span>{inquiryStatusLabel(row.status)}</span>
                            </div>
                          </div>

                          <div>
                            <p className="text-[11px] text-dim mb-1">관심 기능</p>
                            {row.interests.length === 0 ? (
                              <span className="text-dim text-xs">선택 없음</span>
                            ) : (
                              <div className="flex flex-wrap gap-1.5">
                                {row.interests.map(tag => (
                                  <span key={tag} className="px-2 py-0.5 rounded-full bg-surface border border-border text-[11px] text-text-2">
                                    {tag}
                                  </span>
                                ))}
                              </div>
                            )}
                          </div>

                          <div>
                            <p className="text-[11px] text-dim mb-1">문의 내용</p>
                            <p className="whitespace-pre-wrap rounded-lg border border-border bg-surface p-3 text-text-2">{row.message}</p>
                          </div>

                          <div>
                            <p className="text-[11px] text-dim mb-1">상담 메모 (관리자만 확인)</p>
                            <textarea
                              value={noteDraft}
                              onChange={e => setNoteDraft(e.target.value)}
                              rows={3}
                              maxLength={2000}
                              placeholder="상담 일정, 요구사항, 견적 내용 등을 기록하세요."
                              className="w-full rounded-lg border border-border bg-surface p-3 text-sm resize-y"
                            />
                            <button
                              onClick={() => patchInquiry(row.id, { adminNote: noteDraft })}
                              disabled={savingId === row.id}
                              className="mt-2 px-4 py-2 rounded-lg bg-accent text-white text-xs font-bold hover:bg-accent-hover transition cursor-pointer disabled:opacity-50"
                            >
                              {savingId === row.id ? '저장 중...' : '메모 저장'}
                            </button>
                          </div>

                          {row.source_url && (
                            <p className="text-[11px] text-dim">접수 경로: {row.source_url}</p>
                          )}
                        </div>
                      </td>
                    </tr>
                  )}
                </Fragment>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
