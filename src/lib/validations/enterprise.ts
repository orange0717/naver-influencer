import { z } from 'zod';
import {
  COMPANY_TYPE_VALUES,
  INQUIRY_STATUS_VALUES,
  INTEREST_OPTIONS,
  TEAM_SIZE_VALUES,
} from '@/lib/enterprise-inquiry';

const INTEREST_VALUES = INTEREST_OPTIONS as readonly string[];

/** POST /api/enterprise-inquiry — 기업용 문의 접수(비로그인 허용) */
export const enterpriseInquirySchema = z.object({
  companyName: z
    .string()
    .min(1, '회사명을 입력해주세요.')
    .max(100, '회사명은 100자 이하로 입력해주세요.')
    .transform((v) => v.trim()),
  contactName: z
    .string()
    .min(1, '담당자 성함을 입력해주세요.')
    .max(50, '담당자명은 50자 이하로 입력해주세요.')
    .transform((v) => v.trim()),
  contactTitle: z
    .string()
    .max(50, '직함은 50자 이하로 입력해주세요.')
    .optional()
    .transform((v) => v?.trim() || undefined),
  email: z
    .string()
    .email('올바른 이메일 형식을 입력해주세요.')
    .max(100, '이메일은 100자 이하로 입력해주세요.')
    .transform((v) => v.trim().toLowerCase()),
  // 국내 유선/휴대폰 + 대표번호(15xx) 를 모두 허용하되 자릿수만 검증한다.
  phone: z
    .string()
    .transform((v) => v.replace(/[^0-9+]/g, ''))
    .refine((v) => /^(\+?[0-9]{9,15})$/.test(v), '올바른 연락처를 입력해주세요.'),
  companyType: z.enum(COMPANY_TYPE_VALUES, { message: '기업 유형을 선택해주세요.' }),
  teamSize: z.enum(TEAM_SIZE_VALUES, { message: '예상 사용 인원을 선택해주세요.' }),
  interests: z
    .array(z.string())
    .max(INTEREST_VALUES.length)
    .default([])
    // 목록에 없는 값이 섞여 들어오면 조용히 버린다 — 저장값은 항상 화이트리스트 안에 있다.
    .transform((list) => Array.from(new Set(list.filter((v) => INTEREST_VALUES.includes(v))))),
  message: z
    .string()
    .min(10, '문의 내용을 10자 이상 입력해주세요.')
    .max(3000, '문의 내용은 3000자 이하로 입력해주세요.')
    .transform((v) => v.trim()),
  agreePrivacy: z.literal(true, { message: '개인정보 수집 및 이용에 동의해주세요.' }),
  sourceUrl: z.string().max(500).optional(),
});

/** PATCH /api/admin/enterprise-inquiries/[id] — 상태·메모 변경 */
export const enterpriseInquiryUpdateSchema = z
  .object({
    status: z.enum(INQUIRY_STATUS_VALUES).optional(),
    adminNote: z.string().max(2000).optional().transform((v) => v?.trim() ?? undefined),
  })
  .refine((v) => v.status !== undefined || v.adminNote !== undefined, {
    message: '변경할 항목이 없습니다.',
  });
