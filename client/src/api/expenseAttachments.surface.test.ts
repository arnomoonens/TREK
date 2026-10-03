import { describe, it, expect, beforeEach } from 'vitest'
import { http, HttpResponse } from 'msw'
import { server } from '../../tests/helpers/msw/server'
import { expenseAttachmentsApi } from './expenseAttachments'
import { buildTripFile } from '../../tests/helpers/factories'

describe('expenseAttachmentsApi', () => {
  beforeEach(() => {
    server.use(
      http.get('/api/trips/1/budget/7/files', () => HttpResponse.json({ files: [buildTripFile({ id: 11, trip_id: 1 })] })),
      http.post('/api/trips/1/budget/7/files/11', () => HttpResponse.json({ file: buildTripFile({ id: 11, trip_id: 1, linked_budget_item_ids: [7] }) })),
      http.delete('/api/trips/1/budget/7/files/11', () => HttpResponse.json({ success: true, file: buildTripFile({ id: 11, trip_id: 1, linked_budget_item_ids: [] }) })),
    )
  })

  it('maps the focused list and pair mutation endpoints', async () => {
    await expect(expenseAttachmentsApi.list(1, 7)).resolves.toMatchObject({ files: [{ id: 11 }] })
    await expect(expenseAttachmentsApi.attach(1, 7, 11)).resolves.toMatchObject({ file: { linked_budget_item_ids: [7] } })
    await expect(expenseAttachmentsApi.detach(1, 7, 11)).resolves.toMatchObject({ success: true, file: { linked_budget_item_ids: [] } })
  })
})
