import type { Metadata, Viewport } from "next";
import { Suspense } from "react";
import Script from "next/script";
import "./globals.css";
import HeaderWrapper from "@/components/HeaderWrapper";
import Footer from "@/components/Footer";
import VisitTracker from "@/components/VisitTracker";
import ChatBot from "@/components/ChatBot";
import FeedbackButton from "@/components/FeedbackButton";
import ScrollToTopButton from "@/components/ScrollToTopButton";
import Providers from "@/components/Providers";
import UpdateBanner from "@/components/UpdateBanner";
import SubscriptionExpiryStrip from "@/components/SubscriptionExpiryStrip";
import InstallBanner from "@/components/InstallBanner";
import NicknameRequiredModal from "@/components/NicknameRequiredModal";
import FirstVisitModal from "@/components/FirstVisitModal";
import ScrollToTop from "@/components/ScrollToTop";
import SentryUserIdentity from "@/components/SentryUserIdentity";
import GoogleAnalytics from "@/components/GoogleAnalytics";
import { SpeedInsights } from "@vercel/speed-insights/next";

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#BF877A',
};

export const metadata: Metadata = {
  metadataBase: new URL("https://ninfle.kr"),
  title: {
    default: "N인플 — 네이버 인플루언서들을 위한 플랫폼",
    template: "%s | N인플",
  },
  description: "수만 개 키워드의 검색량, 경쟁도, 순위를 분석하여 블루오션 키워드를 추천합니다. 인플루언서 19,980명 + 블로거 83,933명+ 데이터.",
  keywords: ["네이버 인플루언서", "키워드 분석", "블로그 SEO", "키워드 경쟁도", "검색량 조회", "인플루언서 랭킹", "블로그 품질지수", "키워드챌린지"],
  alternates: {
    canonical: "https://ninfle.kr",
  },
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
    other: {
      "naver-site-verification": "naverb9dc1edfb00cc566c64817966e7128c7",
    },
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
    highPrice: '99000',
    offerCount: 3,
    description:
      '인플루언서 리스트·키워드 리스트·커뮤니티는 무료. 7일 무료 체험. 블로거 플랜 5,500원/월, 인플루언서 플랜 9,900원/월, 인플루언서 12개월 99,000원.',
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

const FAQ_JSONLD = {
  '@context': 'https://schema.org',
  '@type': 'FAQPage',
  mainEntity: [
    {
      '@type': 'Question',
      name: 'N인플은 무엇인가요?',
      acceptedAnswer: {
        '@type': 'Answer',
        text: 'N인플(엔인플)은 네이버 인플루언서·블로거를 위한 키워드 분석·랭킹·커뮤니티 SaaS입니다. 19,980명의 인플루언서와 83,933명+의 블로거 데이터를 기반으로 키워드별 검색량·경쟁도·TOP3 점유율을 분석하여 블루오션 키워드를 추천합니다.',
      },
    },
    {
      '@type': 'Question',
      name: '무료로 사용할 수 있나요?',
      acceptedAnswer: {
        '@type': 'Answer',
        text: '인플루언서 리스트, 키워드 리스트, 커뮤니티는 회원가입 없이 무료로 이용 가능합니다. 인플루언서홈 또는 블로그 주소만 입력하면 7일 무료 체험도 시작할 수 있습니다.',
      },
    },
    {
      '@type': 'Question',
      name: '가격은 얼마인가요?',
      acceptedAnswer: {
        '@type': 'Answer',
        text: '블로거 플랜 월 5,500원, 인플루언서 플랜 월 9,900원, 대행사 플랜 월 99,000원입니다. 1·3·6·10·12개월 단위로 결제 가능하며, 장기 결제 시 최대 11% 할인됩니다.',
      },
    },
    {
      '@type': 'Question',
      name: '키워드챌린지 순위는 어떻게 분석하나요?',
      acceptedAnswer: {
        '@type': 'Answer',
        text: '네이버 인플루언서 키워드챌린지의 공식 순위를 매 3시간마다 크롤링하여 추적합니다. 키워드별 검색량(네이버 검색광고 API)·참여자수·TOP3 점유율을 함께 제공하여 블루오션 키워드를 찾을 수 있습니다.',
      },
    },
    {
      '@type': 'Question',
      name: '인플루언서 랭킹 점수 공식은 어떻게 되나요?',
      acceptedAnswer: {
        '@type': 'Answer',
        text: '점수 공식 v3은 (참여자수 − 순위) × 본인 게시글 수로 계산하며, TOP3·본인 카테고리만 합산합니다. 단순 노출이 아니라 실제 참여 성과를 반영하여 진짜 영향력 있는 인플루언서를 식별합니다.',
      },
    },
    {
      '@type': 'Question',
      name: '환불 가능한가요?',
      acceptedAnswer: {
        '@type': 'Answer',
        text: '결제 후 7일 이내 미이용 시 전액 환불됩니다. 결제 수단은 PortOne V2와 한국결제네트웍스(KPN) 카드 결제를 지원합니다.',
      },
    },
  ],
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
        {/* JSON-LD: FAQPage (AI 브리핑 노출용) */}
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(FAQ_JSONLD) }}
        />
      </head>
      <body className="antialiased flex flex-col min-h-screen">
        <Providers>
          <SentryUserIdentity />
          <HeaderWrapper />
          <SubscriptionExpiryStrip />
          <UpdateBanner />
          <Suspense fallback={null}><VisitTracker /></Suspense>
          <main className="max-w-7xl mx-auto px-4 pt-6 pb-10 flex-1 w-full">
            {children}
          </main>
          <Footer />
          <FeedbackButton />
          <ChatBot />
          <ScrollToTopButton />
          <InstallBanner />
          <NicknameRequiredModal />
          <FirstVisitModal />
          <ScrollToTop />
        </Providers>
        <Script src="https://cdn.portone.io/v2/browser-sdk.js" strategy="lazyOnload" />
        <Suspense fallback={null}><GoogleAnalytics /></Suspense>
        <SpeedInsights />
      </body>
    </html>
  );
}
