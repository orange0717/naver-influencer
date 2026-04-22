import { z } from 'zod';

/** POST /api/chat/messages — 메시지 작성 */
export const createMessageSchema = z.object({
  content: z
    .string()
    .min(1, '메시지를 입력해주세요.')
    .max(2000, '메시지는 2000자 이하로 입력해주세요.')
    .transform((v) => v.trim()),
  image_urls: z.array(z.string().url()).max(4, '이미지는 최대 4장까지 첨부 가능합니다.').default([]),
  mentioned_ids: z.array(z.string().max(100)).max(20).default([]),
  reply_to_id: z.string().uuid().optional(),
}).refine((d) => d.content.length > 0 || d.image_urls.length > 0, {
  message: '메시지 또는 이미지 중 하나는 필요합니다.',
});

/** PATCH /api/chat/messages/[id] — 메시지 수정 */
export const editMessageSchema = z.object({
  content: z
    .string()
    .min(1, '메시지를 입력해주세요.')
    .max(2000)
    .transform((v) => v.trim()),
});

/** POST /api/chat/messages/[id]/react — 이모지 리액션 토글 */
export const reactSchema = z.object({
  emoji: z.string().min(1).max(16),
});

/** POST /api/chat/messages/[id]/report — 신고 */
export const chatReportSchema = z.object({
  reason: z.enum(['spam', 'abuse', 'inappropriate', 'other']),
  description: z.string().max(500).optional(),
});

/** GET /api/chat/messages — 커서 페이지네이션 */
export const chatListQuerySchema = z.object({
  before: z.string().datetime().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});
