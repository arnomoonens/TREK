import { filesApi } from '../../api/client'
import { fileRepo } from '../../repo/fileRepo'
import type { StoreApi } from 'zustand'
import type { TripStoreState } from '../tripStore'
import type { TripFile } from '../../types'
import { getApiErrorMessage } from '../../types'
import { isEffectivelyOffline } from '../../sync/networkMode'
import { addTripFile, normalizeTripFile, removeTripFile } from './fileState'

type SetState = StoreApi<TripStoreState>['setState']
type GetState = StoreApi<TripStoreState>['getState']

export interface FilesSlice {
  loadFiles: (tripId: number | string) => Promise<void>
  addFile: (tripId: number | string, formData: FormData) => Promise<TripFile>
  deleteFile: (tripId: number | string, id: number) => Promise<void>
}

export const createFilesSlice = (set: SetState, get: GetState): FilesSlice => ({
  loadFiles: async (tripId) => {
    try {
      const data = await fileRepo.list(tripId)
      if (data.cacheStatus === 'unavailable') {
        set({ filesAvailability: data.cacheStatus })
        return
      }
      set({ files: data.files.map(normalizeTripFile), filesAvailability: data.cacheStatus })
    } catch (err: unknown) {
      console.error('Failed to load files:', err)
    }
  },

  addFile: async (tripId, formData) => {
    if (isEffectivelyOffline()) throw new Error('File uploads are unavailable offline')
    try {
      const data = await filesApi.upload(tripId, formData)
      set(state => ({ files: addTripFile(state.files, data.file) }))
      return data.file
    } catch (err: unknown) {
      throw new Error(getApiErrorMessage(err, 'Error uploading file'))
    }
  },

  deleteFile: async (tripId, id) => {
    try {
      await filesApi.delete(tripId, id)
      set(state => ({ files: removeTripFile(state.files, id) }))
    } catch (err: unknown) {
      throw new Error(getApiErrorMessage(err, 'Error deleting file'))
    }
  },
})
