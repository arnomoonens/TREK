import { expenseAttachmentsApi } from '../api/expenseAttachments'
import { offlineDb } from '../db/offlineDb'

export const expenseAttachmentsRepo = {
  list: (tripId: number | string, expenseId: number | string) => expenseAttachmentsApi.list(tripId, expenseId),
  async attach(tripId: number | string, expenseId: number, fileId: number) {
    const result = await expenseAttachmentsApi.attach(tripId, expenseId, fileId)
    await offlineDb.tripFiles.put(result.file).catch(error => console.warn('Unable to cache expense attachment', error))
    return result
  },
  async detach(tripId: number | string, expenseId: number, fileId: number) {
    const result = await expenseAttachmentsApi.detach(tripId, expenseId, fileId)
    await offlineDb.tripFiles.put(result.file).catch(error => console.warn('Unable to cache expense attachment', error))
    return result
  },
}
