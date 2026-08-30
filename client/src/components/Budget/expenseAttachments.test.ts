import { describe, it, expect } from 'vitest'
import { buildTripFile } from '../../../tests/helpers/factories'
import { filesForExpense } from './expenseAttachments'

describe('expense attachment selection', () => {
  it('returns only live files linked to the requested expense in relationship order', () => {
    const first = buildTripFile({ id: 1, linked_expense_ids: [7], expense_attachment_created_at: { '7': '2026-01-01 10:00:00' } })
    const second = buildTripFile({ id: 2, linked_expense_ids: [7, 8], expense_attachment_created_at: { '7': '2026-01-01 09:00:00' } })
    const deleted = buildTripFile({ id: 3, deleted_at: '2026-01-01', linked_expense_ids: [7] })
    const unrelated = buildTripFile({ id: 4, linked_expense_ids: [8] })

    expect(filesForExpense([first, second, deleted, unrelated], 7).map(file => file.id)).toEqual([2, 1])
  })
})
