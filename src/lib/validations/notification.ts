import { z } from 'zod';

export const notificationSettingsSchema = z.object({
  email_enabled: z.boolean().optional(),
  kakao_enabled: z.boolean().optional(),
  in_app_enabled: z.boolean().optional(),
  notify_top3_entry: z.boolean().optional(),
  notify_top3_exit: z.boolean().optional(),
  notify_significant_change: z.boolean().optional(),
});
