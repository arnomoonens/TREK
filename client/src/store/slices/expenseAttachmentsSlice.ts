import type { StoreApi } from 'zustand'
import type { TripFile } from '../../types'
import { getApiErrorMessage } from '../../types'
import { expenseAttachmentsRepo } from '../../repo/expenseAttachmentsRepo'
import type { TripStoreState } from '../tripStore'

type SetState = StoreApi<TripStoreState>['setState']

export interface ExpenseAttachmentsSlice {
  attachExpenseFile: (tripId: number | string, expenseId: number, fileId: number) => Promise<TripFile>
  detachExpenseFile: (tripId: number | string, expenseId: number, fileId: number) => Promise<TripFile>
}

const replaceFile = (files: TripFile[], updated: TripFile): TripFile[] =>
  files.map(file => file.id === updated.id ? updated : file)

export const createExpenseAttachmentsSlice = (set: SetState): ExpenseAttachmentsSlice => ({
  attachExpenseFile: async (tripId, expenseId, fileId) => {
    try {
      const result = await expenseAttachmentsRepo.attach(tripId, expenseId, fileId)
      set(state => ({ files: replaceFile(state.files, result.file) }))
      return result.file
    } catch (err: unknown) {
      throw new Error(getApiErrorMessage(err, 'Error attaching file'))
    }
  },

  detachExpenseFile: async (tripId, expenseId, fileId) => {
    try {
      const result = await expenseAttachmentsRepo.detach(tripId, expenseId, fileId)
      set(state => ({ files: replaceFile(state.files, result.file) }))
      return result.file
    } catch (err: unknown) {
      throw new Error(getApiErrorMessage(err, 'Error detaching file'))
    }
  },
})
