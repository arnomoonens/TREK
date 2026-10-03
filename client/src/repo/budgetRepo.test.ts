// FE-REPO-BUDGET-001 to FE-REPO-BUDGET-006
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import 'fake-indexeddb/auto'
import { http, HttpResponse } from 'msw'
import { server } from '../../tests/helpers/msw/server'
import { budgetRepo } from './budgetRepo'
import { offlineDb, clearAll } from '../db/offlineDb'
import { buildBudgetItem } from '../../tests/helpers/factories'

function setOnline(v: boolean): void {
  Object.defineProperty(navigator, 'onLine', { value: v, writable: true, configurable: true })
}

beforeEach(async () => {
  await clearAll()
  setOnline(true)
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('budgetRepo.list', () => {
  it('FE-REPO-BUDGET-001: online — returns REST items and caches them', async () => {
    const item = buildBudgetItem({ id: 61, trip_id: 12, name: 'Hotel', total_price: 420 })
    server.use(http.get('/api/trips/12/budget', () => HttpResponse.json({ items: [item] })))

    const result = await budgetRepo.list(12)
    expect(result.items[0].total_price).toBe(420)
    expect(result.source).toBe('network')
    expect(result.cacheStatus).toBe('available')

    await new Promise(r => setTimeout(r, 0))
    expect((await offlineDb.budgetItems.get(61))!.name).toBe('Hotel')
  })

  it('FE-REPO-BUDGET-002: offline — returns only this trip\'s cached items', async () => {
    await offlineDb.budgetItems.bulkPut([
      buildBudgetItem({ id: 62, trip_id: 12 }),
      buildBudgetItem({ id: 63, trip_id: 13 }),
    ])
    setOnline(false)

    const result = await budgetRepo.list('12')
    expect(result.items.map(i => i.id)).toEqual([62])
    expect(result.cacheStatus).toBe('available')
  })

  it('FE-REPO-BUDGET-003: offline with no cache — reports the list as unavailable', async () => {
    setOnline(false)
    const result = await budgetRepo.list(404)
    expect(result.items).toEqual([])
    expect(result.cacheStatus).toBe('unavailable')
  })

  it('FE-REPO-BUDGET-005: an online empty response is known-empty when read offline', async () => {
    server.use(http.get('/api/trips/12/budget', () => HttpResponse.json({ items: [] })))

    await expect(budgetRepo.list(12)).resolves.toMatchObject({
      items: [],
      source: 'network',
      cacheStatus: 'available',
    })

    setOnline(false)
    await expect(budgetRepo.list(12)).resolves.toMatchObject({
      items: [],
      source: 'cache',
      cacheStatus: 'empty',
    })
  })

  it('FE-REPO-BUDGET-006: a 500 is rethrown, not masked by the cache', async () => {
    server.use(http.get('/api/trips/12/budget', () => HttpResponse.json({ error: 'boom' }, { status: 500 })))
    await expect(budgetRepo.list(12)).rejects.toThrow()
  })

  it('returns fresh network expenses even when the local cache cannot be written', async () => {
    const item = buildBudgetItem({ id: 61, trip_id: 12 })
    server.use(http.get('/api/trips/12/budget', () => HttpResponse.json({ items: [item] })))
    const failure = new Error('Quota exceeded')
    vi.spyOn(offlineDb.budgetItems, 'bulkPut').mockRejectedValueOnce(failure)
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})

    await expect(budgetRepo.list(12)).resolves.toMatchObject({ items: [item], source: 'network' })
    expect(warn).toHaveBeenCalledWith('Unable to cache trip expenses', failure)
  })
})
