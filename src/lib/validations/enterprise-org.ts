import { z } from 'zod';
import { COMPANY_TYPE_VALUES } from '@/lib/enterprise-inquiry';
import { MIN_SEATS } from '@/lib/pricing';

const trimmed = (max: number, message: string) =>
  z.string().max(max, message).transform((v) => v.trim());

const email = (message: string) =>
  z.string().email(message).max(100, '이메일은 100자 이하로 입력해주세요.').transform((v) => v.trim().toLowerCase());

/**
 * 사업자등록번호는 숫자 10자리만 확인한다. 국세청 진위확인 API는 쓰지 않기로 했으므로
 * 여기를 통과했다고 실재하는 사업자라는 뜻은 아니다. DB CHECK 제약과 같은 규칙이어야 한다.
 */
const bizRegNo = z
  .string()
  .transform((v) => v.replace(/[^0-9]/g, ''))
  .refine((v) => /^[0-9]{10}$/.test(v), '사업자등록번호 10자리를 입력해주세요.');

const phone = z
  .string()
  .transform((v) => v.replace(/[^0-9+]/g, ''))
  .refine((v) => /^\+?[0-9]{9,15}$/.test(v), '올바른 연락처를 입력해주세요.');

/** POST /api/org/signup — 기업 가입(로그인 필수) */
export const orgSignupSchema = z
  .object({
    planId: z.enum(['BASIC', 'PRO'], { message: '요금제를 선택해주세요.' }),
    /** 대표(OWNER) 좌석을 포함한 총 좌석 수. */
    seatCount: z
      .number()
      .int('이용 인원은 정수로 입력해주세요.')
      .min(MIN_SEATS, `이용 인원은 ${MIN_SEATS}명 이상이어야 합니다.`),
    /** 화면에 표시한 금액. 서버가 다시 계산해 대조하는 용도이며 이 값으로 청구하지 않는다. */
    amount: z.number().int(),

    companyName: trimmed(100, '회사명은 100자 이하로 입력해주세요.').refine((v) => v.length > 0, '회사명을 입력해주세요.'),
    bizRegNo,
    ceoName: trimmed(50, '대표자명은 50자 이하로 입력해주세요.').refine((v) => v.length > 0, '대표자명을 입력해주세요.'),
    industry: z.enum(COMPANY_TYPE_VALUES, { message: '업종을 선택해주세요.' }),

    managerName: trimmed(50, '담당자명은 50자 이하로 입력해주세요.').refine((v) => v.length > 0, '담당자명을 입력해주세요.'),
    managerPhone: phone,
    managerEmail: email('담당자 이메일 형식을 확인해주세요.'),
    taxInvoiceEmail: email('세금계산서 이메일 형식을 확인해주세요.'),

    /** 대표(OWNER)를 뺀 나머지 좌석의 초대 대상. 가입 시점에 전원 입력한다. */
    memberEmails: z.array(email('초대할 이메일 형식을 확인해주세요.')).max(999),

    agreeTos: z.literal(true, { message: '이용약관에 동의해주세요.' }),
    agreePrivacy: z.literal(true, { message: '개인정보 수집 및 이용에 동의해주세요.' }),
  })
  // 좌석 수 대비 초대 인원 검사는 라우트에서 한다 — 초과와 미달에 서로 다른 오류 코드를 줘야 하기 때문이다.
  .refine((v) => new Set(v.memberEmails).size === v.memberEmails.length, {
    message: '같은 이메일을 두 번 초대할 수 없습니다.',
    path: ['memberEmails'],
  });

export type OrgSignupInput = z.infer<typeof orgSignupSchema>;
