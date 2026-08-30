import {
  expenseAttachmentListResponseSchema,
  expenseAttachmentMutationResponseSchema,
  type ExpenseAttachmentListResponse,
  type ExpenseAttachmentMutationResponse,
} from '@trek/shared'
import { apiClient, parseInDev } from './client'

export type ExpenseAttachmentListResult = ExpenseAttachmentListResponse
export type ExpenseAttachmentMutationResult = ExpenseAttachmentMutationResponse

const listResult = (data: unknown): ExpenseAttachmentListResult =>
  parseInDev(expenseAttachmentListResponseSchema, data, 'expenseAttachments.list')

const mutationResult = (data: unknown): ExpenseAttachmentMutationResult =>
  parseInDev(expenseAttachmentMutationResponseSchema, data, 'expenseAttachments.mutation')

export const expenseAttachmentsApi = {
  list: (tripId: number | string, expenseId: number | string) =>
    apiClient.get(`/trips/${tripId}/budget/${expenseId}/files`).then(r => listResult(r.data)),
  attach: (tripId: number | string, expenseId: number, fileId: number) =>
    apiClient.post(`/trips/${tripId}/budget/${expenseId}/files/${fileId}`).then(r => mutationResult(r.data)),
  detach: (tripId: number | string, expenseId: number, fileId: number) =>
    apiClient.delete(`/trips/${tripId}/budget/${expenseId}/files/${fileId}`).then(r => mutationResult(r.data)),
}
