import { z } from 'zod';

const categoryEnum = z.enum(['free', 'tip', 'review', 'qna']).default('free');

/** 투표 선택지 */
const pollOptionSchema = z.object({
  label: z.string().min(1, '선택지를 입력해주세요.').max(100).transform(v => v.trim()),
});

/** 투표 (게시글 작성 시 선택적) */
const pollSchema = z.object({
  question: z.string().min(2, '투표 질문을 입력해주세요.').max(200).transform(v => v.trim()),
  options: z.array(pollOptionSchema).min(2, '선택지는 2개 이상 필요합니다.').max(5, '선택지는 5개 이하로 입력해주세요.'),
  is_multiple: z.boolean().default(false),
}).optional();

/** POST /api/community — 게시글 작성 */
export const createPostSchema = z.object({
  category: categoryEnum,
  title: z
    .string()
    .min(2, '제목은 2자 이상 입력해주세요.')
    .max(100, '제목은 100자 이하로 입력해주세요.')
    .transform((v) => v.trim()),
  content: z
    .string()
    .min(5, '내용은 5자 이상 입력해주세요.')
    .max(5000, '내용은 5000자 이하로 입력해주세요.')
    .transform((v) => v.trim()),
  author_name: z.string().max(50).optional(),
  poll: pollSchema,
});

/** POST /api/community/[id]/vote — 투표 */
export const voteSchema = z.object({
  option_id: z.string().uuid('올바른 선택지를 선택해주세요.'),
});

/** POST /api/community/[id]/comments — 댓글 작성 */
export const createCommentSchema = z.object({
  content: z
    .string()
    .min(1, '댓글 내용을 입력해주세요.')
    .max(1000, '댓글은 1000자 이하로 입력해주세요.')
    .transform((v) => v.trim()),
  author_name: z.string().max(50).optional(),
});

/** POST /api/community/[id]/report — 게시글/댓글 신고 */
export const reportSchema = z.object({
  reason: z.enum(['spam', 'abuse', 'inappropriate', 'other']),
  target_type: z.enum(['post', 'comment']),
  comment_id: z.string().uuid().optional(),
  description: z.string().max(500).optional(),
});

/** POST /api/feedback — 피드백 */
export const feedbackSchema = z.object({
  category: z.string().max(30).default('general'),
  message: z.string().min(2, '피드백 내용을 입력해주세요.').max(1000, '1000자 이내로 입력해주세요.').transform(v => v.trim()),
  pageUrl: z.string().max(500).optional(),
  userName: z.string().max(50).optional(),
});
