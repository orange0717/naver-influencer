import type { Metadata, Viewport } from "next";
import { Suspense } from "react";
import Script from "next/script";
import "./globals.css";
import HeaderWrapper from "@/components/HeaderWrapper";
import Footer from "@/components/Footer";
import VisitTracker from "@/components/VisitTracker";
import ChatBot from "@/components/ChatBot";
import FeedbackButton from "@/components/FeedbackButton";
import Providers from "@/components/Providers";
import UpdateBanner from "@/components/UpdateBanner";
import InstallBanner from "@/components/InstallBanner";
import NicknameRequiredModal from "@/components/NicknameRequiredModal";
import SentryUserIdentity from "@/components/SentryUserIdentity";
import GoogleAnalytics from "@/components/GoogleAnalytics";
import { SpeedInsights } from "@vercel/speed-insights/next";

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
};

export const metadata: Metadata = {
  metadataBase: new URL("https://ninfle.kr"),
  title: "N인플 — 네이버 인플루언서들을 위한 플랫폼",
  description: "수만 개 키워드의 검색량, 경쟁도, 순위를 분석하여 블루오션 키워드를 추천합니다",
  openGraph: {
    title: "N인플 — 네이버 인플루언서들을 위한 플랫폼",
    description: "수만 개 키워드의 검색량, 경쟁도, 순위를 분석하여 블루오션 키워드를 추천합니다",
    url: "https://ninfle.kr",
    siteName: "N인플",
    locale: "ko_KR",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "N인플 — 네이버 인플루언서들을 위한 플랫폼",
    description: "수만 개 키워드의 검색량, 경쟁도, 순위를 분석하여 블루오션 키워드를 추천합니다",
  },
  verification: {
    google: "bBurzozbqzFkS2WMPTSc1jbkhU0nGrslOS90g4UH8Ug",
  },
};

// ─────────────────────────────────────────────
// JSON-LD 구조화 데이터 (LLM/AEO 최적화)
// ─────────────────────────────────────────────
const ORG_JSONLD = {
  '@context': 'https://schema.org',
  '@type': 'Organization',
  '@id': 'https://ninfle.kr/#organization',
  name: 'N인플',
  alternateName: ['엔인플', '네이버 인플루언서 플랫폼'],
  url: 'https://ninfle.kr',
  logo: {
    '@type': 'ImageObject',
    url: 'https://ninfle.kr/icon-512.png',
    width: 512,
    height: 512,
  },
  description:
    '네이버 인플루언서·블로거를 위한 키워드 분석·랭킹·커뮤니티 플랫폼. 수만 개 키워드의 검색량·경쟁도·순위를 분석해 블루오션 키워드를 추천합니다.',
  foundingDate: '2024',
  knowsAbout: [
    '네이버 인플루언서',
    '네이버 블로거',
    '키워드 분석',
    '검색량',
    '키워드 경쟁도',
    '블로그 SEO',
    '인플루언서 랭킹',
    '블로그 품질지수',
  ],
  areaServed: {
    '@type': 'Country',
    name: 'South Korea',
  },
  sameAs: [
    'https://github.com/orange0717/naver-influencer',
  ],
  contactPoint: {
    '@type': 'ContactPoint',
    contactType: 'customer support',
    availableLanguage: ['Korean'],
  },
};

const SOFTWARE_JSONLD = {
  '@context': 'https://schema.org',
  '@type': 'SoftwareApplication',
  '@id': 'https://ninfle.kr/#software',
  name: 'N인플',
  alternateName: ['엔인플'],
  url: 'https://ninfle.kr',
  applicationCategory: 'BusinessApplication',
  applicationSubCategory: 'SEOTools',
  operatingSystem: 'Web',
  inLanguage: 'ko',
  description:
    '네이버 인플루언서를 준비하는 블로거와 현재 인플루언서를 위한 키워드 분석·랭킹·커뮤니티 SaaS. 키워드별 검색량·참여자수·TOP3 점유율 + 인플루언서/블로거 순위 + 블로그 품질지수 + 비회원 투표 가능 커뮤니티.',
  image: 'https://ninfle.kr/icon-512.png',
  publisher: { '@id': 'https://ninfle.kr/#organization' },
  creator: { '@id': 'https://ninfle.kr/#organization' },
  featureList: [
    '인플루언서 리스트 (19,980명, 활동/미활동 자동 판정)',
    '블로거 리스트 (83,933명+ Naver Open API 기반)',
    '키워드 검색량·경쟁도 분석',
    '인플루언서 랭킹 (참여자수×본인 게시글 수 공식)',
    '블로그 품질지수',
    '쇼핑 인사이트 (월간 검색수·연령·성별)',
    '커뮤니티 (비회원 투표 가능)',
    '챗북 (캐릭터 1메시지 50文)',
    '광고 매칭·블로그 분석',
    'Claude AI 기반 글쓰기 피드백',
  ],
  audience: [
    { '@type': 'Audience', audienceType: '네이버 인플루언서를 준비하는 블로거' },
    { '@type': 'Audience', audienceType: '현재 네이버 인플루언서' },
    { '@type': 'Audience', audienceType: '콘텐츠 마케터' },
  ],
  offers: {
    '@type': 'AggregateOffer',
    priceCurrency: 'KRW',
    lowPrice: '0',
    highPrice: '9900',
    offerCount: 3,
    description:
      '인플루언서 리스트·키워드 리스트·커뮤니티는 무료. 7일 무료 체험. 블로거 플랜 5,500원/월, 인플루언서 플랜 9,900원/월.',
  },
};

const WEBSITE_JSONLD = {
  '@context': 'https://schema.org',
  '@type': 'WebSite',
  name: 'N인플',
  alternateName: ['엔인플'],
  url: 'https://ninfle.kr',
  inLanguage: 'ko',
  publisher: { '@id': 'https://ninfle.kr/#organization' },
  potentialAction: {
    '@type': 'SearchAction',
    target: 'https://ninfle.kr/keywords?q={search_term_string}',
    'query-input': 'required name=search_term_string',
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=Noto+Sans+KR:wght@300;400;500;700;800;900&family=Noto+Serif+KR:wght@400;700;900&display=swap" rel="stylesheet" />
        {/* JSON-LD: Organization */}
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(ORG_JSONLD) }}
        />
        {/* JSON-LD: SoftwareApplication */}
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(SOFTWARE_JSONLD) }}
        />
        {/* JSON-LD: WebSite + SearchAction */}
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(WEBSITE_JSONLD) }}
        />
      </head>
      <body className="antialiased flex flex-col min-h-screen">
        <Providers>
          <SentryUserIdentity />
          <HeaderWrapper />
          <UpdateBanner />
          <Suspense fallback={null}><VisitTracker /></Suspense>
          <main className="max-w-7xl mx-auto px-4 pt-6 pb-10 flex-1 w-full">
            {children}
          </main>
          <Footer />
          <FeedbackButton />
          <ChatBot />
          <InstallBanner />
          <NicknameRequiredModal />
        </Providers>
        <Suspense fallback={null}><GoogleAnalytics /></Suspense>
        <SpeedInsights />
      </body>
    </html>
  );
}
