import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor, within } from '../../../tests/helpers/render'
import { buildTripFile } from '../../../tests/helpers/factories'
import type { TripFile } from '../../types'
import { ExpenseAttachmentsDialog, ExpenseAttachmentsSheet } from './ExpenseAttachments'

vi.mock('../../api/authUrl', () => ({
  getAuthUrl: vi.fn().mockResolvedValue('/signed/file'),
}))

const openFile = vi.fn().mockResolvedValue(undefined)
const downloadFile = vi.fn().mockResolvedValue(undefined)

vi.mock('../../utils/fileDownload', () => ({
  openFile: (url: string, name: string) => openFile(url, name),
  downloadFile: (url: string, name: string) => downloadFile(url, name),
}))

function attachmentFiles(): TripFile[] {
  return [
    buildTripFile({
      id: 2,
      original_name: 'late-receipt.pdf',
      file_size: 2048,
      description: 'Final receipt',
      linked_budget_item_ids: [7],
      expense_attachment_created_at: { '7': '2026-08-30 11:00:00' },
    }),
    buildTripFile({
      id: 1,
      original_name: 'early-receipt.jpg',
      mime_type: 'image/jpeg',
      file_size: 1024,
      linked_budget_item_ids: [7],
      expense_attachment_created_at: { '7': '2026-08-30 10:00:00' },
    }),
    buildTripFile({
      id: 3,
      original_name: 'trashed-receipt.txt',
      deleted_at: '2026-08-30 09:00:00',
      linked_budget_item_ids: [7],
      expense_attachment_created_at: { '7': '2026-08-30 09:00:00' },
    }),
    buildTripFile({ id: 4, original_name: 'other-expense.pdf', linked_budget_item_ids: [8] }),
  ]
}

describe('Expense attachment viewer', () => {
  it('shows only live attachments in attachment creation order with read-only metadata', async () => {
    render(
      <ExpenseAttachmentsDialog
        isOpen
        expenseId={7}
        expenseName="Dinner"
        files={attachmentFiles()}
        onClose={vi.fn()}
      />,
    )

    await waitFor(() => expect(screen.getAllByTestId('expense-attachment-row')[0].querySelector('img')?.getAttribute('src')).toBe('/signed/file'))
    expect(screen.getByRole('dialog', { name: 'Attachments for "Dinner"' })).toBeInTheDocument()
    const rows = screen.getAllByTestId('expense-attachment-row')
    expect(rows).toHaveLength(2)
    expect(rows.map(row => within(row).getByTestId('expense-attachment-name').textContent)).toEqual([
      'early-receipt.jpg',
      'late-receipt.pdf',
    ])
    expect(screen.getByText('2.0 KB')).toBeInTheDocument()
    expect(screen.getByText('Final receipt')).toBeInTheDocument()
    expect(screen.queryByText('trashed-receipt.txt')).not.toBeInTheDocument()
    expect(screen.queryByText('other-expense.pdf')).not.toBeInTheDocument()
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument()
  })

  it('delegates PDF open and download actions to the existing Files behavior', async () => {
    render(
      <ExpenseAttachmentsDialog
        isOpen
        expenseId={7}
        expenseName="Dinner"
        files={attachmentFiles()}
        onClose={vi.fn()}
      />,
    )

    const pdfRow = screen.getAllByTestId('expense-attachment-row')[1]
    fireEvent.click(within(pdfRow).getByTestId('expense-attachment-name'))
    await waitFor(() => expect(screen.getByTitle('late-receipt.pdf')).toHaveAttribute('data', '/signed/file#view=FitH'))

    fireEvent.click(within(pdfRow).getByRole('button', { name: 'Download' }))
    expect(downloadFile).toHaveBeenCalledWith(expect.stringContaining('/api/trips/1/files/'), 'late-receipt.pdf')
  })

  it('delegates image previews to the existing Files lightbox', async () => {
    render(
      <ExpenseAttachmentsDialog
        isOpen
        expenseId={7}
        expenseName="Dinner"
        files={attachmentFiles()}
        onClose={vi.fn()}
      />,
    )

    const imageRow = screen.getAllByTestId('expense-attachment-row')[0]
    fireEvent.click(within(imageRow).getByTestId('expense-attachment-name'))

    expect(await screen.findByText('1 / 1')).toBeInTheDocument()
    expect(await screen.findByAltText('early-receipt.jpg')).toHaveAttribute('src', '/signed/file')
  })

  it('renders the image lightbox outside the expense dialog so the full image can use the viewport', async () => {
    render(
      <ExpenseAttachmentsDialog
        isOpen
        expenseId={7}
        expenseName="Dinner"
        files={attachmentFiles()}
        onClose={vi.fn()}
      />,
    )

    const imageRow = screen.getAllByTestId('expense-attachment-row')[0]
    fireEvent.click(within(imageRow).getByTestId('expense-attachment-name'))

    const lightboxImage = await screen.findByAltText('early-receipt.jpg')
    const lightbox = lightboxImage.closest('[data-testid="file-image-lightbox"]')
    expect(lightbox).not.toBeNull()
    expect(lightbox?.parentElement).toBe(document.body)
    expect(lightbox).toHaveStyle({ zIndex: '20000' })
  })

  it('falls back to the existing type icon when an image thumbnail fails', async () => {
    render(
      <ExpenseAttachmentsDialog
        isOpen
        expenseId={7}
        expenseName="Dinner"
        files={attachmentFiles()}
        onClose={vi.fn()}
      />,
    )

    const imageRow = screen.getAllByTestId('expense-attachment-row')[0]
    await waitFor(() => expect(imageRow.querySelector('img')).not.toBeNull())
    fireEvent.error(imageRow.querySelector('img')!)

    expect(await within(imageRow).findByTestId('expense-attachment-type-icon')).toBeInTheDocument()
  })

  it('uses the mobile bottom-sheet presentation for the same read-only list', async () => {
    render(
      <ExpenseAttachmentsSheet
        open
        expenseId={7}
        expenseName="Dinner"
        files={attachmentFiles()}
        onClose={vi.fn()}
      />,
    )

    await waitFor(() => expect(screen.getAllByTestId('expense-attachment-row')[0].querySelector('img')?.getAttribute('src')).toBe('/signed/file'))
    expect(screen.getByRole('dialog', { name: 'Attachments for "Dinner"' })).toBeInTheDocument()
    expect(screen.getAllByTestId('expense-attachment-row')).toHaveLength(2)
  })
})
