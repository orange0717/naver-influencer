export const metadata = {
  title: '개인정보처리방침 - N인플',
};

export default function PrivacyPage() {
  return (
    <div className="max-w-3xl mx-auto space-y-8">
      <h1 className="text-2xl font-extrabold">개인정보처리방침</h1>

      <div className="bg-surface rounded-2xl border border-border p-6 md:p-8 space-y-6 text-sm text-dim leading-relaxed">
        <section className="space-y-2">
          <h2 className="text-base font-bold text-text">1. 개인정보의 수집 및 이용 목적</h2>
          <p>N인플(이하 &quot;서비스&quot;)은 다음의 목적을 위해 개인정보를 수집 및 이용합니다.</p>
          <ul className="list-disc list-inside pl-2 space-y-1">
            <li>회원 가입 및 관리: 회원 식별, 서비스 제공, 고객 상담</li>
            <li>서비스 제공: 인플루언서 대시보드, 키워드 분석 등 서비스 이용</li>
            <li>결제 처리: 유료 서비스(PRO 이용권) 결제 및 환불 처리</li>
            <li>서비스 개선: 이용 통계 분석, 서비스 품질 향상</li>
          </ul>
        </section>

        <section className="space-y-2">
          <h2 className="text-base font-bold text-text">2. 수집하는 개인정보 항목</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-xs border-collapse">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-left py-2 px-3 font-semibold text-text">구분</th>
                  <th className="text-left py-2 px-3 font-semibold text-text">수집 항목</th>
                  <th className="text-left py-2 px-3 font-semibold text-text">수집 방법</th>
                </tr>
              </thead>
              <tbody>
                <tr className="border-b border-border/50">
                  <td className="py-2 px-3">필수</td>
                  <td className="py-2 px-3">이메일, 닉네임, 비밀번호(암호화), 네이버 인플루언서 ID</td>
                  <td className="py-2 px-3">회원가입</td>
                </tr>
                <tr className="border-b border-border/50">
                  <td className="py-2 px-3">자동 수집</td>
                  <td className="py-2 px-3">접속 IP, 접속 일시, 방문 페이지·유입 경로(리퍼러, UTM), 기기·브라우저 정보, 서비스 이용 기록(로그인 회원은 회원 식별자와 함께 저장될 수 있음)</td>
                  <td className="py-2 px-3">서비스 이용</td>
                </tr>
                <tr className="border-b border-border/50">
                  <td className="py-2 px-3">결제 시</td>
                  <td className="py-2 px-3">결제 기록 (결제 수단 정보는 PG사에서 직접 처리)</td>
                  <td className="py-2 px-3">결제 진행</td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>

        <section className="space-y-2">
          <h2 className="text-base font-bold text-text">3. 개인정보의 보유 및 이용 기간</h2>
          <ul className="list-disc list-inside pl-2 space-y-1">
            <li>회원 탈퇴 시까지 보유하며, 탈퇴 즉시 파기합니다.</li>
            <li>단, 관련 법령에 따라 보존이 필요한 경우 해당 기간 동안 보관합니다.
              <ul className="list-disc list-inside pl-4 mt-1 space-y-0.5">
                <li>계약 또는 청약철회 등에 관한 기록: 5년</li>
                <li>대금결제 및 재화 등의 공급에 관한 기록: 5년</li>
                <li>소비자 불만 또는 분쟁처리에 관한 기록: 3년</li>
                <li>접속에 관한 기록: 3개월</li>
              </ul>
            </li>
          </ul>
        </section>

        <section className="space-y-2">
          <h2 className="text-base font-bold text-text">4. 개인정보의 제3자 제공</h2>
          <p>
            서비스는 원칙적으로 회원의 개인정보를 제3자에게 제공하지 않습니다.
            다만 다음의 경우는 예외로 합니다.
          </p>
          <ul className="list-disc list-inside pl-2 space-y-1">
            <li>회원이 사전에 동의한 경우</li>
            <li>법령의 규정에 의한 경우</li>
            <li>수사 목적으로 법령에 정해진 절차와 방법에 따라 수사기관의 요구가 있는 경우</li>
          </ul>
        </section>

        <section className="space-y-2">
          <h2 className="text-base font-bold text-text">5. 개인정보의 파기</h2>
          <ul className="list-disc list-inside pl-2 space-y-1">
            <li>보유 기간이 경과하거나 처리 목적이 달성된 경우 지체 없이 파기합니다.</li>
            <li>전자적 파일 형태: 복구 불가능한 방법으로 영구 삭제</li>
            <li>종이 문서: 분쇄기로 분쇄하거나 소각</li>
          </ul>
        </section>

        <section className="space-y-2">
          <h2 className="text-base font-bold text-text">6. 개인정보의 안전성 확보 조치</h2>
          <p>서비스는 개인정보의 안전성 확보를 위해 다음의 조치를 취하고 있습니다.</p>
          <ul className="list-disc list-inside pl-2 space-y-1">
            <li>비밀번호 암호화 저장</li>
            <li>SSL/TLS를 통한 데이터 전송 구간 암호화</li>
            <li>접근 권한 관리 및 제한</li>
            <li>개인정보 접근 기록의 보관 및 위변조 방지</li>
          </ul>
        </section>

        <section className="space-y-2">
          <h2 className="text-base font-bold text-text">7. 이용자의 권리</h2>
          <p>회원은 언제든지 다음의 권리를 행사할 수 있습니다.</p>
          <ul className="list-disc list-inside pl-2 space-y-1">
            <li>개인정보 열람, 정정, 삭제, 처리정지 요구</li>
            <li>회원 탈퇴를 통한 개인정보 수집 및 이용 동의 철회</li>
          </ul>
        </section>

        <section className="space-y-2">
          <h2 className="text-base font-bold text-text">8. 쿠키의 사용</h2>
          <p>
            서비스는 로그인 상태 유지 및 사용자 인증을 위해 쿠키를 사용합니다.
            쿠키는 브라우저 설정에서 관리할 수 있으며, 쿠키 저장을 거부할 경우 서비스 이용에 제한이 있을 수 있습니다.
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-base font-bold text-text">9. 개인정보 보호책임자</h2>
          <p>
            개인정보 처리에 관한 불만 처리 및 피해 구제를 위해 아래와 같이 개인정보 보호책임자를 지정하고 있습니다.
          </p>
          <ul className="list-disc list-inside pl-2 space-y-1">
            <li>담당: N인플 운영팀</li>
            <li>문의: 서비스 내 문의 기능 이용</li>
          </ul>
        </section>

        <section className="space-y-2">
          <h2 className="text-base font-bold text-text">10. 개인정보처리방침의 변경</h2>
          <p>
            본 개인정보처리방침은 법령, 정책 또는 서비스 변경에 따라 수정될 수 있으며,
            변경 시 서비스 공지사항을 통해 안내합니다.
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-base font-bold text-text">11. 제3자 블로그 공개정보 수집 (순위 서비스)</h2>
          <p>
            서비스는 블로거 순위·카테고리 통계 제공을 위해 네이버 공식 Open API 를 이용하여 공개된 블로그 정보를 수집합니다.
          </p>
          <ul className="list-disc list-inside pl-2 space-y-1">
            <li><strong>수집 항목:</strong> 블로그 ID(공개된 URL 식별자), 블로그 닉네임, 최근 포스팅 날짜, 발견 경로 키워드</li>
            <li><strong>수집 방법:</strong> 네이버 Open API (openapi.naver.com) 만 사용. HTML 스크래핑·비공식 API 호출 없음.</li>
            <li><strong>수집하지 않는 정보:</strong> 이메일·전화번호 등 개인 연락처, 비공개 포스트 내용, 로그인이 필요한 정보</li>
            <li><strong>수집 원칙:</strong> robots.txt 준수, 네이버 일일 할당량의 80% 이내 사용, 요청 간격 250ms 이상</li>
            <li><strong>이용 목적:</strong> 블로거 순위 산정·카테고리별 통계 제공 서비스 운영 (수집한 데이터의 제3자 판매·재배포 금지)</li>
            <li><strong>보유 기간:</strong> 서비스 제공 목적 달성 시까지. 블로그 소유자의 요청 시 즉시 삭제 + 재수집 차단 리스트에 추가.</li>
            <li><strong>제외 요청:</strong> 블로그 소유자는 <a href="/bot-info" className="text-accent underline">/bot-info</a> 페이지를 통해 본인 블로그의 수집 중단·삭제를 요청할 수 있으며, 48시간 이내 처리됩니다.</li>
            <li><strong>봇 식별:</strong> User-Agent 에 <code className="text-[10px] font-mono bg-bg px-1 py-0.5 rounded">NinflBot/1.0 (+https://naver-influencer.vercel.app/bot-info)</code> 명시하여 투명하게 운영합니다.</li>
          </ul>
        </section>

        <section className="space-y-2">
          <h2 className="text-base font-bold text-text">12. 크롬 확장 프로그램 (N인플 키워드 분석)</h2>
          <p>
            N인플 키워드 분석 크롬 확장 프로그램은 아래와 같이 데이터를 처리합니다.
          </p>
          <ul className="list-disc list-inside pl-2 space-y-1">
            <li><strong>수집하지 않는 정보:</strong> 확장 프로그램은 사용자의 개인정보를 별도로 수집하거나 서버에 저장하지 않습니다.</li>
            <li><strong>기기 내 처리 데이터:</strong> 네이버 검색 키워드, 블로그 에디터 텍스트(글자수 카운트 및 키워드 추출)는 기기 내에서만 일시적으로 처리됩니다.</li>
            <li><strong>API 전송:</strong> 키워드 검색량 조회를 위해 키워드 텍스트만 자체 API 서버(naver-influencer.vercel.app)로 전송됩니다. 사용자 식별 정보는 포함되지 않습니다.</li>
            <li><strong>Chrome Storage:</strong> 분석 컨텍스트(선택한 키워드, 페이지 정보)를 기기 내에 일시적으로 저장하며, 확장 프로그램 비활성화 시 삭제됩니다.</li>
            <li><strong>제3자 제공:</strong> 확장 프로그램은 어떠한 사용자 데이터도 제3자에게 판매, 제공 또는 공유하지 않습니다.</li>
          </ul>
        </section>

        <div className="pt-4 border-t border-border">
          <p className="text-xs text-dim">시행일자: 2026년 3월 1일 | 최종 수정: 2026년 4월 17일</p>
        </div>
      </div>
    </div>
  );
}
