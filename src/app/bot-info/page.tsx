import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'NinflBot 정보 · N인플',
  description: 'N인플 크롤러 봇(NinflBot) 정보 및 차단 방법 안내',
};

export default function BotInfoPage() {
  return (
    <div className="max-w-2xl mx-auto px-4 py-12 space-y-6">
      <h1 className="type-page-title">NinflBot 안내</h1>
      <p className="text-sm text-dim">
        N인플은 순위·키워드 분석 서비스를 운영하기 위해 네이버 공식 Open API 와 로그인 없이 접근 가능한 공개 웹페이지에서 데이터를 수집합니다.
        본 페이지는 수집 경로별 동작 방식과 차단 방법을 투명하게 안내합니다.
      </p>

      <section className="bg-surface rounded-lg border border-border p-5 space-y-3">
        <h2 className="text-lg font-bold">크롤러 식별 정보</h2>
        <div className="text-sm space-y-1">
          <p><span className="text-dim">User-Agent</span>: <code className="font-mono bg-bg px-2 py-0.5 rounded">NinflBot/1.0 (+https://ninfle.kr/bot-info)</code></p>
          <p><span className="text-dim">데이터 소스</span>: 네이버 공식 Open API (openapi.naver.com) · 검색광고 API · 데이터랩 API</p>
          <p><span className="text-dim">수집 항목</span>: 공개된 블로그 ID · 닉네임 · 최근 포스팅 날짜</p>
          <p><span className="text-dim">수집 목적</span>: 블로거 순위·카테고리 통계 서비스 제공</p>
          <p className="pt-2 border-t border-border"><span className="text-dim">공개 페이지 수집</span>: 공식 API 로 제공되지 않는 인플루언서 순위·키워드 챌린지 참여 현황 등은 로그인 없이 접근 가능한 공개 페이지에서 수집합니다. 비공식 내부 API 나 인증이 필요한 영역은 이용하지 않습니다.</p>
        </div>
      </section>

      <section className="bg-surface rounded-lg border border-border p-5 space-y-3">
        <h2 className="text-lg font-bold">수집하지 않는 것</h2>
        <ul className="text-sm list-disc list-inside space-y-1">
          <li>비공개 포스트의 내용</li>
          <li>이메일·전화번호 등 개인정보</li>
          <li>로그인이 필요한 페이지</li>
          <li>robots.txt 에서 차단한 경로</li>
        </ul>
      </section>

      <section className="bg-surface rounded-lg border border-border p-5 space-y-3">
        <h2 className="text-lg font-bold">내 블로그를 제외하고 싶다면</h2>
        <p className="text-sm">
          블로그 소유자는 아래 방법으로 N인플 DB 에서 본인 블로그를 제거할 수 있습니다.
        </p>
        <ol className="text-sm list-decimal list-inside space-y-1">
          <li>본인 블로그 주소와 함께 <a href="mailto:orange0717@users.noreply.github.com" className="text-accent underline">운영자에게 이메일</a></li>
          <li>요청 접수 후 <strong>48시간 이내</strong> 제거 + 재수집 차단 리스트에 추가</li>
          <li>제거 완료 시 회신</li>
        </ol>
      </section>

      <section className="bg-surface rounded-lg border border-border p-5 space-y-3">
        <h2 className="text-lg font-bold">준수 사항</h2>
        <ul className="text-sm list-disc list-inside space-y-1">
          <li>네이버 Open API 일일 할당량의 80% 이내 사용</li>
          <li>요청 간격 최소 250ms</li>
          <li>robots.txt 준수</li>
          <li>공식 API 로 제공되는 항목은 공식 API 우선 사용, 그 외에는 공개 페이지만 수집</li>
          <li>수집한 데이터 제3자 판매·재배포 금지</li>
        </ul>
      </section>

      <p className="text-xs text-dim pt-4 border-t border-border">
        문의·이의 제기: <a href="mailto:orange0717@users.noreply.github.com" className="underline">orange0717@users.noreply.github.com</a>
      </p>
    </div>
  );
}
