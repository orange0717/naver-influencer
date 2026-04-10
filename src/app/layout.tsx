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

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
};

export const metadata: Metadata = {
  title: "N인플 — 네이버 인플루언서들을 위한 플랫폼",
  description: "수만 개 키워드의 검색량, 경쟁도, 순위를 분석하여 블루오션 키워드를 추천합니다",
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
      </head>
      <body className="antialiased flex flex-col min-h-screen">
        <Providers>
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
        </Providers>
        <Script src="https://cdn.portone.io/v2/browser-sdk.js" strategy="lazyOnload" />
      </body>
    </html>
  );
}
