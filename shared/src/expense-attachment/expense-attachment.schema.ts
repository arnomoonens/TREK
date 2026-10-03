import { z } from 'zod';
import { tripFileSchema } from '../file/file.schema';

export const expenseAttachmentListResponseSchema = z.object({
  files: z.array(tripFileSchema),
});
export type ExpenseAttachmentListResponse = z.infer<typeof expenseAttachmentListResponseSchema>;

export const expenseAttachmentMutationResponseSchema = z.object({
  success: z.boolean().optional(),
  file: tripFileSchema,
});
export type ExpenseAttachmentMutationResponse = z.infer<typeof expenseAttachmentMutationResponseSchema>;
