import { budgetApi } from '../api/client'
import { offlineDb, markBudgetMetadataCached, replaceBudgetItems } from '../db/offlineDb'
import { onlineThenCache } from './withOfflineFallback'
import type { BudgetItem } from '../types'
import type { ReadResult } from './readResult'

export const budgetRepo = {
  async list(tripId: number | string): Promise<ReadResult<{ items: BudgetItem[] }>> {
    const numericTripId = Number(tripId)
    return onlineThenCache(
      async () => {
        const result = await budgetApi.list(tripId)
        await replaceBudgetItems(numericTripId, result.items)
        await markBudgetMetadataCached(numericTripId)
        return { ...result, source: 'network', cacheStatus: 'available' }
      },
      async () => {
        const items = await offlineDb.budgetItems
          .where('trip_id').equals(numericTripId).toArray()
        const metadataCached = await offlineDb.syncMeta.get(numericTripId)
        return {
          items,
          source: 'cache' as const,
          cacheStatus: items.length > 0
            ? 'available' as const
            : metadataCached?.budgetMetadataCachedAt != null
              ? 'empty' as const
              : 'unavailable' as const,
        }
      },
    )
  },
}
