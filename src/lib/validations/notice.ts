import { z } from 'zod';

/** POST /api/notices — 공지 작성 */
export const createNoticeSchema = z.object({
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
  tag: z.enum(['notice', 'update', 'event']).default('notice'),
});

/** POST /api/notices/[id]/comments — 댓글 작성 */
export const createNoticeCommentSchema = z.object({
  content: z
    .string()
    .min(1, '댓글 내용을 입력해주세요.')
    .max(1000, '댓글은 1000자 이하로 입력해주세요.')
    .transform((v) => v.trim()),
});
