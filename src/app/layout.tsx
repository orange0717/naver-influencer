import type { Metadata } from "next";
import "./globals.css";
import Header from "@/components/Header";
import Footer from "@/components/Footer";

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
        <link rel="preconnect" href="https://cdn.jsdelivr.net" crossOrigin="anonymous" />
        <link href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable-dynamic-subset.min.css" rel="stylesheet" />
      </head>
      <body className="antialiased flex flex-col min-h-screen">
        <Header />
        <main className="max-w-7xl mx-auto px-4 py-6 flex-1 w-full">
          {children}
        </main>
        <Footer />
      </body>
    </html>
  );
}
