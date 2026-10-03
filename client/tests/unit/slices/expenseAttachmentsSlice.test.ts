import { describe, it, expect, beforeEach } from 'vitest'
import { http, HttpResponse } from 'msw'
import { offlineDb } from '../../../src/db/offlineDb'
import { useTripStore } from '../../../src/store/tripStore'
import { resetAllStores, seedStore } from '../../helpers/store'
import { buildTripFile } from '../../helpers/factories'
import { server } from '../../helpers/msw/server'

beforeEach(async () => {
  resetAllStores()
  await offlineDb.tripFiles.clear()
})

describe('expenseAttachmentsSlice', () => {
  it('replaces the authoritative file after attach and detach', async () => {
    const initial = buildTripFile({ id: 11, trip_id: 1, linked_budget_item_ids: [] })
    const attached = { ...initial, linked_budget_item_ids: [7] }
    const detached = { ...initial, linked_budget_item_ids: [] }
    seedStore(useTripStore, { files: [initial] })
    server.use(
      http.post('/api/trips/1/budget/7/files/11', () => HttpResponse.json({ file: attached })),
      http.delete('/api/trips/1/budget/7/files/11', () => HttpResponse.json({ success: true, file: detached })),
    )

    await useTripStore.getState().attachExpenseFile(1, 7, 11)
    expect(useTripStore.getState().files[0].linked_budget_item_ids).toEqual([7])
    expect((await offlineDb.tripFiles.get(11))?.linked_budget_item_ids).toEqual([7])
    await useTripStore.getState().detachExpenseFile(1, 7, 11)
    expect(useTripStore.getState().files[0].linked_budget_item_ids).toEqual([])
    expect((await offlineDb.tripFiles.get(11))?.linked_budget_item_ids).toEqual([])
  })
})
