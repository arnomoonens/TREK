import { describe, it, expect } from 'vitest'
import { buildBudgetItem, buildTripFile } from '../../../tests/helpers/factories'
import { filesForExpense, getExpenseDeleteWarning, linkedExpenseCount } from './expenseAttachmentUtils'

describe('expense attachment selection', () => {
  it('returns only live files linked to the requested expense in relationship order', () => {
    const first = buildTripFile({ id: 1, linked_budget_item_ids: [7], expense_attachment_created_at: { '7': '2026-01-01 10:00:00' } })
    const second = buildTripFile({ id: 2, linked_budget_item_ids: [7, 8], expense_attachment_created_at: { '7': '2026-01-01 09:00:00' } })
    const deleted = buildTripFile({ id: 3, deleted_at: '2026-01-01', linked_budget_item_ids: [7] })
    const unrelated = buildTripFile({ id: 4, linked_budget_item_ids: [8] })

    expect(filesForExpense([first, second, deleted, unrelated], 7).map(file => file.id)).toEqual([2, 1])
  })

  it('counts unique links only when the referenced Expense is live', () => {
    const file = buildTripFile({ linked_budget_item_ids: [7, 7, 8, 99] })

    expect(linkedExpenseCount(file, [buildBudgetItem({ id: 7 }), buildBudgetItem({ id: 8 })])).toBe(2)
    expect(linkedExpenseCount(file, [buildBudgetItem({ id: 7 })])).toBe(1)
  })

  it('uses the plural deletion warning when multiple attached Files remain', () => {
    const files = [
      buildTripFile({ id: 1, linked_budget_item_ids: [7] }),
      buildTripFile({ id: 2, linked_budget_item_ids: [7], deleted_at: '2026-01-02' }),
    ]
    const calls: Array<{ key: string; params?: Record<string, string | number> }> = []
    const t = (key: string, params?: Record<string, string | number>) => {
      calls.push({ key, params })
      return key
    }

    const warning = getExpenseDeleteWarning(files, { id: 7, name: 'Dinner' }, t)

    expect(warning.count).toBe(2)
    expect(calls).toEqual([{ key: 'costs.confirm.deleteBodyWithFiles', params: { name: 'Dinner', count: 2 } }])
  })
})
