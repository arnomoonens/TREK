import { describe, expect, it } from 'vitest';
import {
  expenseAttachmentListResponseSchema,
  expenseAttachmentMutationResponseSchema,
} from './expense-attachment.schema';

const file = {
  id: 4,
  trip_id: 2,
  filename: 'receipt.pdf',
  original_name: 'receipt.pdf',
  mime_type: 'application/pdf',
  created_at: '2026-08-30 10:00:00',
  url: '/api/trips/2/files/4/download',
  linked_expense_ids: [12],
  expense_attachment_created_at: { '12': '2026-08-30 10:00:00' },
};

describe('expense attachment response schemas', () => {
  it('accepts a focused list response with enriched Files', () => {
    expect(expenseAttachmentListResponseSchema.safeParse({ files: [file] }).success).toBe(true);
  });

  it('accepts attach and detach response envelopes', () => {
    expect(expenseAttachmentMutationResponseSchema.safeParse({ file }).success).toBe(true);
    expect(expenseAttachmentMutationResponseSchema.safeParse({ success: true, file }).success).toBe(true);
  });
});
