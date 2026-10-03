import { describe, expect, it, vi, beforeEach } from 'vitest'
import userEvent from '@testing-library/user-event'
import { render, screen, waitFor } from '../../../../../tests/helpers/render'
import { resetAllStores, seedStore } from '../../../../../tests/helpers/store'
import { buildBudgetItem, buildTrip, buildTripFile } from '../../../../../tests/helpers/factories'
import { useTripStore } from '../../../../store/tripStore'
import MCostSheet from './MCostSheet'

describe('MCostSheet expense attachments', () => {
  beforeEach(() => resetAllStores())

  it('attaches a selected trip File when saving a new expense', async () => {
    const user = userEvent.setup()
    const file = buildTripFile({ id: 23, original_name: 'receipt.pdf' })
    const addBudgetItem = vi.fn(async () => buildBudgetItem({ id: 44, trip_id: 1, name: 'Lunch' }))
    const attachExpenseFile = vi.fn(async (_tripId: number, expenseId: number, fileId: number) =>
      buildTripFile({ id: fileId, linked_budget_item_ids: [expenseId] }),
    )
    const onSaved = vi.fn()
    seedStore(useTripStore, {
      trip: buildTrip({ id: 1, currency: 'EUR' }),
      files: [file],
      addBudgetItem,
      attachExpenseFile,
    })

    render(
      <MCostSheet
        tripId={1}
        base="EUR"
        people={[{ id: 1, username: 'Alice', avatar_url: null }]}
        me={1}
        editing={null}
        canAttachFiles
        onClose={vi.fn()}
        onSaved={onSaved}
      />,
    )

    const textboxes = screen.getAllByRole('textbox')
    await user.type(textboxes[0], 'Lunch')
    await user.type(textboxes[1], '12')
    await user.click(screen.getByRole('checkbox', { name: 'receipt.pdf' }))
    await user.click(screen.getByRole('button', { name: 'Add' }))

    await waitFor(() => expect(onSaved).toHaveBeenCalledOnce())
    expect(addBudgetItem).toHaveBeenCalledOnce()
    expect(attachExpenseFile).toHaveBeenCalledWith(1, 44, file.id)
  })
})
