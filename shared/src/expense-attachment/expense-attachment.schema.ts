import { z } from 'zod';
import { tripFileSchema } from '../file/file.schema';

export const expenseAttachmentSchema = z.object({
  id: z.number().int().positive(),
  expense_id: z.number().int().positive(),
  file_id: z.number().int().positive(),
  created_at: z.string(),
});
export type ExpenseAttachment = z.infer<typeof expenseAttachmentSchema>;

export const expenseAttachmentListResponseSchema = z.object({
  files: z.array(tripFileSchema),
});
export type ExpenseAttachmentListResponse = z.infer<typeof expenseAttachmentListResponseSchema>;

export const expenseAttachmentMutationResponseSchema = z.object({
  success: z.boolean().optional(),
  file: tripFileSchema,
});
export type ExpenseAttachmentMutationResponse = z.infer<typeof expenseAttachmentMutationResponseSchema>;
