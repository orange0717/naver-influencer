/**
 * 기업용 문의(B2B) 공용 상수.
 * 문의 폼(/enterprise)·관리자 화면(/admin/enterprise)·검증 스키마가 같은 값을 쓰도록 여기 한 곳에 둔다.
 * DB 의 CHECK 제약(migration-100)과 값이 1:1로 일치해야 한다.
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

export const TEAM_SIZES = [
  { value: '1-5', label: '1~5명' },
  { value: '6-10', label: '6~10명' },
  { value: '11-30', label: '11~30명' },
  { value: '31-100', label: '31~100명' },
  { value: '100+', label: '100명 이상' },
  { value: 'undecided', label: '아직 미정' },
] as const;

/** 관심 기능 — 제공 확정 목록이 아니라 상담 주제다. */
export const INTEREST_OPTIONS = [
  '키워드 분석',
  '블로그 분석',
  '네이버 인플루언서 분석',
  '미노출/검색 노출 분석',
  'AI 분석',
  '마케팅 데이터 분석',
  '대량 분석',
  '기업용 리포트',
  '사용자 관리',
  '맞춤형 기능 개발',
  '기타',
] as const;

export const INQUIRY_STATUSES = [
  { value: 'new', label: '신규 문의' },
  { value: 'reviewing', label: '확인 중' },
  { value: 'scheduled', label: '상담 예정' },
  { value: 'consulted', label: '상담 완료' },
  { value: 'quoted', label: '견적 전달' },
  { value: 'contracting', label: '계약 진행' },
  { value: 'contracted', label: '계약 완료' },
  { value: 'on_hold', label: '보류' },
  { value: 'closed', label: '종료' },
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
export type TeamSize = (typeof TEAM_SIZES)[number]['value'];
export type InquiryStatus = (typeof INQUIRY_STATUSES)[number]['value'];

export const COMPANY_TYPE_VALUES = COMPANY_TYPES.map((t) => t.value) as [CompanyType, ...CompanyType[]];
export const TEAM_SIZE_VALUES = TEAM_SIZES.map((t) => t.value) as [TeamSize, ...TeamSize[]];
export const INQUIRY_STATUS_VALUES = INQUIRY_STATUSES.map((s) => s.value) as [InquiryStatus, ...InquiryStatus[]];

function labelOf(list: readonly { value: string; label: string }[], value: string): string {
  return list.find((item) => item.value === value)?.label ?? value;
}

export const companyTypeLabel = (v: string) => labelOf(COMPANY_TYPES, v);
export const teamSizeLabel = (v: string) => labelOf(TEAM_SIZES, v);
export const inquiryStatusLabel = (v: string) => labelOf(INQUIRY_STATUSES, v);
