export const metadata = {
  title: '이용약관 - N인플',
};

export default function TermsPage() {
  return (
    <div className="max-w-3xl mx-auto space-y-8">
      <h1 className="text-2xl font-extrabold">이용약관</h1>

      <div className="bg-surface rounded-2xl border border-border p-6 md:p-8 space-y-6 text-sm text-dim leading-relaxed">
        <section className="space-y-2">
          <h2 className="text-base font-bold text-text">제1조 (목적)</h2>
          <p>
            본 약관은 N인플(이하 &quot;서비스&quot;)이 제공하는 인플루언서 분석 서비스의 이용 조건 및 절차,
            회원과 서비스 간의 권리, 의무, 책임사항 등을 규정함을 목적으로 합니다.
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-base font-bold text-text">제2조 (정의)</h2>
          <ol className="list-decimal list-inside space-y-1 pl-2">
            <li>&quot;서비스&quot;란 N인플이 제공하는 네이버 인플루언서 키워드 챌린지 분석, 순위 추적, 대시보드 등 일체의 서비스를 말합니다.</li>
            <li>&quot;회원&quot;이란 서비스에 가입하여 이용계약을 체결한 자를 말합니다.</li>
            <li>&quot;유료 서비스&quot;란 PRO 이용권 구매를 통해 이용할 수 있는 대시보드 기능을 말합니다.</li>
          </ol>
        </section>

        <section className="space-y-2">
          <h2 className="text-base font-bold text-text">제3조 (약관의 효력 및 변경)</h2>
          <ol className="list-decimal list-inside space-y-1 pl-2">
            <li>본 약관은 서비스 화면에 게시하거나 기타 방법으로 회원에게 공지함으로써 효력이 발생합니다.</li>
            <li>서비스는 합리적인 사유가 있을 경우 약관을 변경할 수 있으며, 변경된 약관은 공지 후 7일이 경과한 날부터 효력이 발생합니다.</li>
          </ol>
        </section>

        <section className="space-y-2">
          <h2 className="text-base font-bold text-text">제4조 (회원가입 및 이용계약)</h2>
          <ol className="list-decimal list-inside space-y-1 pl-2">
            <li>서비스 이용을 원하는 자는 본 약관에 동의하고 회원가입 절차를 완료하여야 합니다.</li>
            <li>회원가입 시 네이버 인플루언서홈 주소를 입력해야 하며, 본인의 인플루언서 계정만 등록할 수 있습니다.</li>
            <li>타인의 정보를 도용하여 가입한 경우 서비스 이용이 제한될 수 있습니다.</li>
          </ol>
        </section>

        <section className="space-y-2">
          <h2 className="text-base font-bold text-text">제5조 (서비스의 제공)</h2>
          <ol className="list-decimal list-inside space-y-1 pl-2">
            <li>서비스는 다음의 기능을 제공합니다:
              <ul className="list-disc list-inside pl-4 mt-1 space-y-0.5">
                <li>인플루언서 키워드 챌린지 순위 분석</li>
                <li>키워드 경쟁도 및 트렌드 분석</li>
                <li>개인 대시보드 (유료)</li>
                <li>인플루언서/키워드 목록 조회 (무료)</li>
                <li>커뮤니티 (무료)</li>
              </ul>
            </li>
            <li>서비스는 연중무휴 24시간 제공을 원칙으로 하나, 시스템 점검 등의 사유로 일시 중단될 수 있습니다.</li>
          </ol>
        </section>

        <section className="space-y-2">
          <h2 className="text-base font-bold text-text">제6조 (유료 서비스)</h2>
          <ol className="list-decimal list-inside space-y-1 pl-2">
            <li>예비 인플루언서 이용권(1/3/6/9/12개월) 또는 인플루언서 이용권(1/3/6/9/12개월) 구매 시 해당 플랜의 기능을 이용할 수 있습니다.</li>
            <li>이용권 가격 및 기간은 이용권 페이지에 표시된 바에 따릅니다.</li>
            <li>3일 무료 체험은 1회에 한하여 제공됩니다.</li>
          </ol>
        </section>

        <section className="space-y-2">
          <h2 className="text-base font-bold text-text">제7조 (환불 정책)</h2>
          <ol className="list-decimal list-inside space-y-1 pl-2">
            <li>구매일로부터 7일 이내에 유료 서비스를 이용하지 않은 경우 전액 환불이 가능합니다.</li>
            <li>유료 서비스를 이용한 경우(대시보드 접속, 데이터 조회 등), 이용 일수를 차감한 잔여 금액을 환불합니다.</li>
            <li>월간 이용권: 일할 계산(결제금액 / 30일 x 잔여일수)으로 환불합니다.</li>
            <li>연간 이용권: 월할 계산(결제금액 / 12개월 x 잔여 월수)으로 환불합니다.</li>
            <li>환불 신청은 마이페이지 또는 이메일(orange@orangelibrary.co.kr)로 가능합니다.</li>
            <li>환불은 신청일로부터 영업일 기준 3~5일 이내에 원래 결제 수단으로 처리됩니다.</li>
            <li>무료 체험 기간 중에는 별도의 환불 절차 없이 이용이 종료됩니다.</li>
          </ol>
        </section>

        <section className="space-y-2">
          <h2 className="text-base font-bold text-text">제8조 (회원의 의무)</h2>
          <ol className="list-decimal list-inside space-y-1 pl-2">
            <li>회원은 서비스 이용 시 관계 법령, 본 약관의 규정을 준수하여야 합니다.</li>
            <li>회원은 서비스의 데이터를 무단으로 크롤링, 스크래핑, 복제, 재배포할 수 없습니다.</li>
            <li>회원은 타인의 권리를 침해하거나 서비스 운영을 방해하는 행위를 할 수 없습니다.</li>
          </ol>
        </section>

        <section className="space-y-2">
          <h2 className="text-base font-bold text-text">제9조 (서비스 이용 제한)</h2>
          <p>
            서비스는 회원이 본 약관을 위반하거나 서비스의 정상적인 운영을 방해하는 경우,
            사전 통지 없이 서비스 이용을 제한하거나 회원 자격을 정지할 수 있습니다.
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-base font-bold text-text">제10조 (면책)</h2>
          <ol className="list-decimal list-inside space-y-1 pl-2">
            <li>서비스는 네이버에서 제공하는 공개 데이터를 기반으로 분석 결과를 제공하며, 데이터의 정확성을 100% 보장하지 않습니다.</li>
            <li>서비스 이용으로 발생하는 모든 의사결정의 책임은 회원에게 있습니다.</li>
            <li>천재지변, 시스템 장애 등 불가항력적 사유로 인한 서비스 중단에 대해 책임을 지지 않습니다.</li>
          </ol>
        </section>

        <section className="space-y-2">
          <h2 className="text-base font-bold text-text">제11조 (분쟁 해결)</h2>
          <p>
            서비스 이용과 관련하여 분쟁이 발생한 경우, 양 당사자는 원만한 해결을 위해 협의하며,
            협의가 이루어지지 않는 경우 관련 법령에 따라 처리합니다.
          </p>
        </section>

        <div className="pt-4 border-t border-border">
          <p className="text-xs text-dim">시행일자: 2026년 3월 1일</p>
        </div>
      </div>
    </div>
  );
}
