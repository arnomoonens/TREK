import { fileUpdateRequestSchema, fileLinkRequestSchema, photoVariantSchema, tripFileSchema } from './file.schema';

import { describe, it, expect } from 'vitest';

describe('fileUpdateRequestSchema', () => {
  it('accepts optional metadata, nullable ids, an empty body', () => {
    expect(fileUpdateRequestSchema.safeParse({ description: 'doc', place_id: 3 }).success).toBe(true);
    expect(fileUpdateRequestSchema.safeParse({ place_id: null, reservation_id: '7' }).success).toBe(true);
    expect(fileUpdateRequestSchema.safeParse({}).success).toBe(true);
  });
});

describe('fileLinkRequestSchema', () => {
  it('accepts any subset of reservation/assignment/place ids', () => {
    expect(fileLinkRequestSchema.safeParse({ reservation_id: 1 }).success).toBe(true);
    expect(fileLinkRequestSchema.safeParse({ assignment_id: '2', place_id: null }).success).toBe(true);
    expect(fileLinkRequestSchema.safeParse({}).success).toBe(true);
  });
});

describe('photoVariantSchema', () => {
  it('only allows thumbnail or original', () => {
    expect(photoVariantSchema.safeParse('thumbnail').success).toBe(true);
    expect(photoVariantSchema.safeParse('original').success).toBe(true);
    expect(photoVariantSchema.safeParse('full').success).toBe(false);
  });
});

describe('tripFileSchema', () => {
  it('accepts the enriched trip-file response shape', () => {
    expect(tripFileSchema.safeParse({
      id: 4,
      trip_id: 2,
      filename: 'receipt.pdf',
      original_name: 'receipt.pdf',
      mime_type: 'application/pdf',
      created_at: '2026-08-30 10:00:00',
      url: '/api/trips/2/files/4/download',
      linked_reservation_ids: [9],
      linked_expense_ids: [12],
      expense_attachment_created_at: { '12': '2026-08-30 10:00:00' },
    }).success).toBe(true);
  });
});
