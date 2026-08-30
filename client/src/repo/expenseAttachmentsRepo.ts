import { expenseAttachmentsApi } from '../api/expenseAttachments'

export const expenseAttachmentsRepo = {
  list: (tripId: number | string, expenseId: number | string) => expenseAttachmentsApi.list(tripId, expenseId),
  attach: (tripId: number | string, expenseId: number, fileId: number) => expenseAttachmentsApi.attach(tripId, expenseId, fileId),
  detach: (tripId: number | string, expenseId: number, fileId: number) => expenseAttachmentsApi.detach(tripId, expenseId, fileId),
}
