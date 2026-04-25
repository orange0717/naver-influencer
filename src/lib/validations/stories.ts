import { z } from 'zod';

/** POST /api/stories — 후기 작성 */
export const createStorySchema = z.object({
  title: z
    .string()
    .min(2, '제목은 2자 이상 입력해주세요.')
    .max(100, '제목은 100자 이하로 입력해주세요.')
    .transform((v) => v.trim()),
  content: z
    .string()
    .min(10, '내용은 10자 이상 입력해주세요.')
    .max(5000, '내용은 5000자 이하로 입력해주세요.')
    .transform((v) => v.trim()),
  short_excerpt: z
    .string()
    .max(140, '짧은 후기는 140자 이하로 입력해주세요.')
    .transform((v) => v.trim())
    .optional(),
  is_anonymous: z.boolean().default(false),
  metric_before: z.string().max(50).optional(),
  metric_after: z.string().max(50).optional(),
  period: z.string().max(30).optional(),
  author_name: z.string().max(50).optional(),
  images: z
    .array(z.string().url('유효한 이미지 URL이 아닙니다.').max(500))
    .max(6, '이미지는 최대 6장까지 첨부할 수 있습니다.')
    .optional(),
});

/** POST /api/stories/[id]/comments — 후기 댓글 작성 */
export const createStoryCommentSchema = z.object({
  content: z
    .string()
    .min(1, '댓글 내용을 입력해주세요.')
    .max(1000, '댓글은 1000자 이하로 입력해주세요.')
    .transform((v) => v.trim()),
  author_name: z.string().max(50).optional(),
});

/** PATCH /api/stories/[id] — 관리자 승인/거절/노출 조정 */
export const patchStorySchema = z.object({
  status: z.enum(['pending', 'approved', 'rejected']).optional(),
  reject_reason: z.string().max(300).optional(),
  is_featured: z.boolean().optional(),
  featured_order: z.number().int().min(0).max(9999).nullable().optional(),
});
