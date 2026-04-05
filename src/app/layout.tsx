import type { Metadata, Viewport } from "next";
import { Suspense } from "react";
import "./globals.css";
import HeaderWrapper from "@/components/HeaderWrapper";
import Footer from "@/components/Footer";
import HideOnAd from "@/components/HideOnAd";
import VisitTracker from "@/components/VisitTracker";
import ChatBot from "@/components/ChatBot";
import FeedbackButton from "@/components/FeedbackButton";
import Providers from "@/components/Providers";
import UpdateBanner from "@/components/UpdateBanner";
import PwaAnnounceBanner from "@/components/PwaAnnounceBanner";
import ServiceWorkerRegistrar from "@/components/ServiceWorkerRegistrar";
import NativeProvider from "@/components/NativeProvider";

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
};

export const metadata: Metadata = {
  title: "N인플 — 네이버 인플루언서들을 위한 플랫폼",
  description: "수만 개 키워드의 검색량, 경쟁도, 순위를 분석하여 블루오션 키워드를 추천합니다",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "N인플",
  },
  other: {
    "mobile-web-app-capable": "yes",
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
        <link rel="icon" href="/favicon.svg" type="image/svg+xml" />
        <link rel="apple-touch-icon" href="/icons/icon-192.svg" />
        <meta name="theme-color" content="#E4C1B8" />
      </head>
      <body className="antialiased flex flex-col min-h-screen">
        <Providers>
          <NativeProvider>
          <HideOnAd><HeaderWrapper /></HideOnAd>
          <HideOnAd><UpdateBanner /></HideOnAd>
          <HideOnAd><PwaAnnounceBanner /></HideOnAd>
          <Suspense fallback={null}><VisitTracker /></Suspense>
          <main className="max-w-7xl mx-auto px-4 pt-6 pb-10 flex-1 w-full">
            {children}
          </main>
          <HideOnAd><Footer /></HideOnAd>
          <HideOnAd><FeedbackButton /></HideOnAd>
          <HideOnAd><ChatBot /></HideOnAd>
          <ServiceWorkerRegistrar />
          </NativeProvider>
        </Providers>
      </body>
    </html>
  );
}
