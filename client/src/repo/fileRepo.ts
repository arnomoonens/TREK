import { filesApi } from '../api/client'
import { offlineDb, markFileMetadataCached, replaceTripFiles } from '../db/offlineDb'
import { onlineThenCache } from './withOfflineFallback'
import type { TripFile } from '../types'
import type { ReadResult } from './readResult'

export const fileRepo = {
  async list(tripId: number | string): Promise<ReadResult<{ files: TripFile[] }>> {
    const numericTripId = Number(tripId)
    return onlineThenCache(
      async () => {
        const result = await filesApi.list(tripId)
        try {
          await replaceTripFiles(numericTripId, result.files)
          await markFileMetadataCached(numericTripId)
        } catch (error) {
          console.warn('Unable to cache trip files', error)
        }
        return { ...result, source: 'network', cacheStatus: 'available' }
      },
      async () => {
        const files = (await offlineDb.tripFiles
          .where('trip_id').equals(numericTripId).toArray())
          .filter(file => !file.deleted_at)
        const metadataCached = await offlineDb.syncMeta.get(numericTripId)
        return {
          files,
          source: 'cache' as const,
          cacheStatus: files.length > 0
            ? 'available' as const
            : metadataCached?.filesMetadataCachedAt != null
              ? 'empty' as const
              : 'unavailable' as const,
        }
      },
    )
  },
}
