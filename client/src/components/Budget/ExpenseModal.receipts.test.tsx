// FE-COSTS-EXPRECEIPT-001 to FE-COSTS-EXPRECEIPT-004
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, within } from '../../../tests/helpers/render'
import userEvent from '@testing-library/user-event'
import { useAuthStore } from '../../store/authStore'
import { useTripStore } from '../../store/tripStore'
import { resetAllStores, seedStore } from '../../../tests/helpers/store'
import { buildBudgetItem, buildTrip, buildTripFile, buildUser } from '../../../tests/helpers/factories'
import type { BudgetItem } from '../../types'
import { ExpenseModal } from './CostsPanel'

vi.mock('../../api/authUrl', () => ({ getAuthUrl: vi.fn().mockResolvedValue('http://test/receipt') }))

const people = [
  { id: 1, username: 'alice', avatar_url: null },
  { id: 2, username: 'bob', avatar_url: null },
]

function renderModal(editing: BudgetItem | null) {
  return render(<ExpenseModal tripId={1} base="EUR" people={people} me={1} editing={editing} canAttachFiles canUploadFiles onClose={vi.fn()} onSaved={vi.fn()} />)
}

const receiptsCard = () => screen.getByText('Files for this expense', { selector: '#expense-files-title' }).closest('section') as HTMLElement

beforeEach(() => {
  resetAllStores()
  seedStore(useAuthStore, { user: buildUser(), isAuthenticated: true })
  seedStore(useTripStore, { trip: buildTrip({ id: 1, currency: 'EUR' }) })
})

describe('ExpenseModal receipts and note', () => {
  it('FE-COSTS-EXPRECEIPT-001: a new expense starts without receipts and takes picked files', async () => {
    renderModal(null)
    expect(within(receiptsCard()).getByText('No files for this expense yet.')).toBeInTheDocument()
    fireEvent.click(within(receiptsCard()).getByRole('tab', { name: /^Upload$/ }))
    const input = screen.getByTestId('expense-upload-input') as HTMLInputElement
    fireEvent.change(input, { target: { files: [new File(['a'], 'lunch.jpg', { type: 'image/jpeg' }), new File(['b'], 'taxi.pdf', { type: 'application/pdf' })] } })
    expect(await within(receiptsCard()).findByText('lunch.jpg')).toBeInTheDocument()
    expect(within(receiptsCard()).getByText('taxi.pdf')).toBeInTheDocument()
    // The picker is emptied, so the same file can be picked again.
    expect(input.value).toBe('')
  })

  it('FE-COSTS-EXPRECEIPT-002: a picked file is taken off again before saving', async () => {
    const user = userEvent.setup()
    renderModal(null)
    await user.click(within(receiptsCard()).getByRole('tab', { name: /^Upload$/ }))
    const input = screen.getByTestId('expense-upload-input') as HTMLInputElement
    fireEvent.change(input, { target: { files: [new File(['a'], 'lunch.jpg', { type: 'image/jpeg' })] } })
    await within(receiptsCard()).findByText('lunch.jpg')
    fireEvent.change(input, { target: { files: [] } })
    await user.click(within(receiptsCard()).getByRole('button', { name: 'Remove link lunch.jpg' }))
    expect(within(receiptsCard()).queryByText('lunch.jpg')).toBeNull()
    expect(screen.queryByTestId('expense-staged-upload')).toBeNull()
  })

  it('FE-COSTS-EXPRECEIPT-003: a saved receipt opens in the preview and can be taken off the expense', async () => {
    const user = userEvent.setup()
    const editing = buildBudgetItem({ id: 8, name: 'Dinner' })
    seedStore(useTripStore, { files: [
      buildTripFile({ id: 31, original_name: 'dinner-bill.pdf', mime_type: 'application/pdf', linked_budget_item_ids: [8] }),
      buildTripFile({ id: 32, original_name: 'tip.jpg', mime_type: 'image/jpeg', linked_budget_item_ids: [8] }),
    ] })
    renderModal(editing)
    const picked = within(receiptsCard()).getByRole('checkbox', { name: 'tip.jpg' })
    expect(picked).toBeChecked()
    await user.click(picked)
    expect(picked).not.toBeChecked()
    // Removing a selection leaves the trip file available for reuse.
    expect(within(receiptsCard()).getByText('tip.jpg')).toBeInTheDocument()
    await user.click(within(receiptsCard()).getByRole('button', { name: 'Open dinner-bill.pdf' }))
    expect(screen.getAllByText('dinner-bill.pdf').length).toBeGreaterThan(1)
  })

  it('FE-COSTS-EXPRECEIPT-004: the note takes what is typed', async () => {
    const user = userEvent.setup()
    renderModal(null)
    const note = screen.getByRole('textbox', { name: 'Note' })
    await user.type(note, 'Paid in cash')
    expect(note).toHaveValue('Paid in cash')
  })
})
