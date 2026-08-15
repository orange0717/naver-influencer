'use client';

import Link from 'next/link';
import { CONTACT_BLOG_URL, CONTACT_EMAIL, contactBlogLabel } from '@/lib/site-contact';

const FOOTER_LINKS = [
  { href: '/terms', label: '이용약관' },
  { href: '/privacy', label: '개인정보처리방침' },
];

export default function Footer() {
  return (
    <footer className="bg-footer-bg text-footer-text"
      style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}>
      <div className="max-w-7xl mx-auto px-4 py-8">
        {/* 브랜드 + 링크 */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-md bg-footer-text/10 flex items-center justify-center text-footer-heading text-xs">N</div>
            <span className="font-title text-footer-text text-sm">N인플</span>
          </div>
          <nav className="flex flex-wrap items-center justify-end gap-4">
            {FOOTER_LINKS.map(link => (
              <Link key={link.href} href={link.href} className="text-xs text-footer-dim hover:text-footer-text transition-colors">
                {link.label}
              </Link>
            ))}
          </nav>
        </div>

        {/* 사업자정보 + 저작권 */}
        <div className="border-t border-footer-dim/20 pt-4 text-[11px] text-footer-dim/70 leading-relaxed">
          <p>
            오렌지도서관 · 대표 한미선 · 사업자등록번호 702-62-00986 · 통신판매 2026-충남아산-0325 · 전화 0507-1394-5091 · 이메일{' '}
            <a href={`mailto:${CONTACT_EMAIL}`} className="underline hover:text-footer-text transition-colors">
              {CONTACT_EMAIL}
            </a>
            {' · '}
            블로그{' '}
            <a
              href={CONTACT_BLOG_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="underline hover:text-footer-text transition-colors"
            >
              {contactBlogLabel()}
            </a>
          </p>
          <p>충청남도 아산시 탕정면 탕정면로 22번길 15-12 301호 · 개인정보보호책임자 한미선</p>
          <p className="mt-2 text-footer-dim/50">&copy; 2026 오렌지도서관</p>
          <p className="mt-3 text-footer-dim/60">N인플은 오렌지도서관이 운영하는 네이버 인플루언서 분석 플랫폼입니다.</p>
          <p className="mt-1 text-footer-dim/40">
            N인플은 네이버의 공식 서비스가 아니며, 공개된 데이터를 기반으로 분석 정보를 제공하는 독립 서비스입니다. NAVER 및 네이버는 NAVER Corp.의 등록상표입니다.
          </p>
        </div>
      </div>
    </footer>
  );
}
