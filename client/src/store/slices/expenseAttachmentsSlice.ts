import type { StoreApi } from 'zustand'
import type { TripFile } from '../../types'
import { getApiErrorMessage } from '../../types'
import { expenseAttachmentsRepo } from '../../repo/expenseAttachmentsRepo'
import { isEffectivelyOffline } from '../../sync/networkMode'
import type { TripStoreState } from '../tripStore'
import { upsertTripFile } from './fileState'

type SetState = StoreApi<TripStoreState>['setState']

export interface ExpenseAttachmentsSlice {
  attachExpenseFile: (tripId: number | string, expenseId: number, fileId: number) => Promise<TripFile>
  detachExpenseFile: (tripId: number | string, expenseId: number, fileId: number) => Promise<TripFile>
}

export const createExpenseAttachmentsSlice = (set: SetState): ExpenseAttachmentsSlice => ({
  attachExpenseFile: async (tripId, expenseId, fileId) => {
    if (isEffectivelyOffline()) throw new Error('Attachment changes are unavailable offline')
    try {
      const result = await expenseAttachmentsRepo.attach(tripId, expenseId, fileId)
      set(state => ({ files: upsertTripFile(state.files, result.file) }))
      return result.file
    } catch (err: unknown) {
      throw new Error(getApiErrorMessage(err, 'Error attaching file'))
    }
  },

  detachExpenseFile: async (tripId, expenseId, fileId) => {
    if (isEffectivelyOffline()) throw new Error('Attachment changes are unavailable offline')
    try {
      const result = await expenseAttachmentsRepo.detach(tripId, expenseId, fileId)
      set(state => ({ files: upsertTripFile(state.files, result.file) }))
      return result.file
    } catch (err: unknown) {
      throw new Error(getApiErrorMessage(err, 'Error detaching file'))
    }
  },
})
