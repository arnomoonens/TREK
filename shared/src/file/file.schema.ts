import { z } from 'zod';

/**
 * File + photo API contract.
 *
 * Files live under /api/trips/:tripId/files (upload, metadata, star, trash,
 * reservation links, authenticated download). Photos live under /api/photos
 * (thumbnail/original streaming + info) and are global, not trip-scoped.
 *
 * Uploads are multipart/form-data so the file itself isn't modelled here; these
 * schemas pin the JSON-ish metadata fields that ride along or come as request
 * bodies. The bespoke 400/403/404 controller messages pin the rest.
 */

const nullableIdField = z.union([z.string(), z.number()]).nullable().optional();
const nullableResponseIdField = z.number().int().positive().nullable().optional();

/**
 * Multipart text fields riding along with the upload — always strings on the
 * wire (multipart/form-data has no other type), so no numeric coercion here.
 */
export const fileUploadRequestSchema = z.object({
  place_id: z.string().optional(),
  description: z.string().optional(),
  reservation_id: z.string().optional(),
});
export type FileUploadRequest = z.infer<typeof fileUploadRequestSchema>;

export const fileUpdateRequestSchema = z.object({
  description: z.string().optional(),
  place_id: nullableIdField,
  reservation_id: nullableIdField,
});
export type FileUpdateRequest = z.infer<typeof fileUpdateRequestSchema>;

export const fileLinkRequestSchema = z.object({
  reservation_id: nullableIdField,
  assignment_id: nullableIdField,
  place_id: nullableIdField,
});
export type FileLinkRequest = z.infer<typeof fileLinkRequestSchema>;

/** The JSON representation returned by trip-file and expense-attachment reads. */
export const tripFileSchema = z.object({
  id: z.number().int().positive(),
  trip_id: z.number().int().positive(),
  place_id: nullableResponseIdField,
  reservation_id: nullableResponseIdField,
  note_id: nullableResponseIdField,
  uploaded_by: nullableResponseIdField,
  uploaded_by_name: z.string().nullable().optional(),
  uploaded_by_avatar: z.string().nullable().optional(),
  filename: z.string(),
  original_name: z.string(),
  file_size: z.number().nullable().optional(),
  mime_type: z.string().nullable().optional(),
  description: z.string().nullable().optional(),
  starred: z.number().optional(),
  deleted_at: z.string().nullable().optional(),
  created_at: z.string().optional(),
  reservation_title: z.string().nullable().optional(),
  linked_reservation_ids: z.array(z.number().nullable()).optional(),
  linked_place_ids: z.array(z.number().nullable()).optional(),
  linked_expense_ids: z.array(z.number().int().positive()).optional(),
  expense_attachment_created_at: z.record(z.string(), z.string()).optional(),
  url: z.string(),
}).passthrough();
export type TripFileResponse = z.infer<typeof tripFileSchema>;

/** Variants the photo streaming endpoints accept. */
export const photoVariantSchema = z.enum(['thumbnail', 'original']);
export type PhotoVariant = z.infer<typeof photoVariantSchema>;
