/**
 * 기업용(B2B) 공용 상수.
 *
 * 온라인 상담 폼(/enterprise)은 2026-09-03 폐지하고 메일 창구로 일원화했다.
 * 남은 쓰임은 둘이다 — 기업 가입의 업종 선택지, 그리고 푸터·가입 페이지의 메일 문의 링크.
 *
 * COMPANY_TYPES 는 enterprise_orgs.industry 의 CHECK 제약(migration-164)과 값이 1:1로 일치해야 한다.
 */

export const COMPANY_TYPES = [
  { value: 'general', label: '일반 기업' },
  { value: 'agency', label: '광고/마케팅 대행사' },
  { value: 'brand', label: '브랜드/쇼핑몰' },
  { value: 'franchise', label: '프랜차이즈' },
  { value: 'public', label: '공공기관' },
  { value: 'education', label: '교육기관' },
  { value: 'etc', label: '기타' },
] as const;

/**
 * 이메일 문의용 제목·본문. 메일 주소는 site-contact.ts 의 CONTACT_EMAIL 을 쓰고,
 * 문구는 여기 한 곳에만 둔다 — 페이지 여러 곳에 같은 문장을 복사해 두면 서로 어긋난다.
 */
export const INQUIRY_EMAIL_SUBJECT = '[N인플 기업용 문의] 기업용 서비스 상담 요청';

export const INQUIRY_EMAIL_BODY = [
  '안녕하세요. N인플 기업용 서비스에 대해 문의드립니다.',
  '',
  '회사명:',
  '담당자명:',
  '직함/직책:',
  '이메일:',
  '연락처:',
  '기업 유형:',
  '예상 사용 인원:',
  '관심 있는 기능:',
  '문의 내용:',
  '',
  '감사합니다.',
].join('\r\n');

/**
 * mailto 링크를 만든다. 줄바꿈은 CRLF(%0D%0A)로 인코딩해야 메일 앱이 줄을 그대로 살린다(RFC 6068).
 * 한글 제목·본문도 encodeURIComponent 로 퍼센트 인코딩해야 깨지지 않는다.
 */
export function buildInquiryMailto(email: string): string {
  const subject = encodeURIComponent(INQUIRY_EMAIL_SUBJECT);
  const body = encodeURIComponent(INQUIRY_EMAIL_BODY);
  return `mailto:${email}?subject=${subject}&body=${body}`;
}

export type CompanyType = (typeof COMPANY_TYPES)[number]['value'];

export const COMPANY_TYPE_VALUES = COMPANY_TYPES.map((t) => t.value) as [CompanyType, ...CompanyType[]];
