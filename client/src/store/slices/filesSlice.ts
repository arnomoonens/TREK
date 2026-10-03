import { filesApi } from '../../api/client'
import { fileRepo } from '../../repo/fileRepo'
import type { StoreApi } from 'zustand'
import type { TripStoreState } from '../tripStore'
import type { TripFile } from '../../types'
import type { FileLinkRequest } from '@trek/shared'
import { getApiErrorMessage } from '../../types'
import { isEffectivelyOffline } from '../../sync/networkMode'
import { addTripFile, normalizeTripFile, removeTripFile } from './fileState'

type SetState = StoreApi<TripStoreState>['setState']
type GetState = StoreApi<TripStoreState>['getState']

export interface FilesSlice {
  /** Returns false when a usable file list is unavailable; keeps the last files on failure. */
  loadFiles: (tripId: number | string) => Promise<boolean>
  addFile: (tripId: number | string, formData: FormData) => Promise<TripFile>
  deleteFile: (tripId: number | string, id: number) => Promise<void>
  /** Links a file the trip already has to a booking, place or expense, then reloads the files. */
  linkFile: (tripId: number | string, id: number, link: FileLinkRequest) => Promise<void>
  /** Takes a file off a booking, whichever way it was attached, and keeps the file. */
  unlinkFileFromReservation: (tripId: number | string, file: TripFile, reservationId: number) => Promise<void>
}

export const createFilesSlice = (set: SetState, get: GetState): FilesSlice => ({
  loadFiles: async (tripId) => {
    try {
      const data = await fileRepo.list(tripId)
      if (data.cacheStatus === 'unavailable') {
        set({ filesAvailability: data.cacheStatus })
        return false
      }
      set({ files: data.files.map(normalizeTripFile), filesAvailability: data.cacheStatus })
      return true
    } catch (err: unknown) {
      console.error('Failed to load files:', err)
      return false
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

  linkFile: async (tripId, id, link) => {
    try {
      await filesApi.addLink(tripId, id, link)
    } catch (err: unknown) {
      throw new Error(getApiErrorMessage(err, 'Error linking file'))
    }
    await get().loadFiles(tripId)
  },

  unlinkFileFromReservation: async (tripId, file, reservationId) => {
    try {
      // Uploaded on the booking, the file points at it itself; linked later, a link row does.
      if (file.reservation_id === reservationId) await filesApi.update(tripId, file.id, { reservation_id: null })
      const { links = [] } = (await filesApi.getLinks(tripId, file.id)) as { links?: { id: number; reservation_id: number | null }[] }
      const link = links.find(l => l.reservation_id === reservationId)
      if (link) await filesApi.removeLink(tripId, file.id, link.id)
    } catch (err: unknown) {
      throw new Error(getApiErrorMessage(err, 'Error unlinking file'))
    } finally {
      await get().loadFiles(tripId)
    }
  },
})
