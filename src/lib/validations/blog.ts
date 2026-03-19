import { z } from 'zod';
import { blogIdSchema } from './index';

/** POST /api/blog/keywords */
export const blogKeywordSchema = z.object({
  blog_id: blogIdSchema,
  keyword: z.string().min(1, '키워드를 입력해주세요.').max(100),
  is_auto: z.boolean().default(false),
});

/** DELETE /api/blog/keywords */
export const deleteBlogKeywordSchema = z.object({
  blog_id: blogIdSchema,
  keyword: z.string().min(1, '키워드를 입력해주세요.'),
});

/** GET /api/blog/rank — searchParams */
export const blogRankQuerySchema = z.object({
  keyword: z.string().min(1, 'keyword 파라미터가 필요합니다.'),
  blogId: blogIdSchema,
});
