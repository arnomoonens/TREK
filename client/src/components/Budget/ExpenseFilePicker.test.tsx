import { describe, expect, it, vi } from 'vitest'
import userEvent from '@testing-library/user-event'
import {
  fireEvent,
  render,
  screen,
  waitFor,
} from '../../../tests/helpers/render'
import { buildTripFile } from '../../../tests/helpers/factories'
import ExpenseFilePicker, {
  type ExpenseStagedUpload,
} from './ExpenseFilePicker'

function renderPicker({
  files = [],
  canAttachFiles = true,
  canUploadFiles = false,
  offline = false,
  onAddUploads = vi.fn(),
  onToggleFile = vi.fn(),
}: {
  files?: ReturnType<typeof buildTripFile>[]
  canAttachFiles?: boolean
  canUploadFiles?: boolean
  offline?: boolean
  onAddUploads?: (files: File[]) => void
  onToggleFile?: (fileId: number) => void
} = {}) {
  const stagedUploads: ExpenseStagedUpload[] = []
  return render(
    <ExpenseFilePicker
      files={files}
      selectedFileIds={new Set()}
      onToggleFile={onToggleFile}
      stagedUploads={stagedUploads}
      onAddUploads={onAddUploads}
      onRemoveUpload={vi.fn()}
      canAttachFiles={canAttachFiles}
      canUploadFiles={canUploadFiles}
      offline={offline}
    />,
  )
}

describe('ExpenseFilePicker', () => {
  it('supports a multi-file drop on the Upload tab', async () => {
    const onAddUploads = vi.fn()
    renderPicker({ canUploadFiles: true, onAddUploads })
    await userEvent.click(screen.getByRole('tab', { name: 'Upload' }))

    const first = new File(['receipt'], 'receipt.pdf', {
      type: 'application/pdf',
    })
    const second = new File(['ticket'], 'ticket.pdf', {
      type: 'application/pdf',
    })
    fireEvent.drop(screen.getByTestId('expense-upload-dropzone'), {
      dataTransfer: {
        files: [first, second],
        items: [
          { kind: 'file', type: first.type, getAsFile: () => first },
          { kind: 'file', type: second.type, getAsFile: () => second },
        ],
        types: ['Files'],
      },
    })

    await waitFor(() =>
      expect(onAddUploads).toHaveBeenCalledWith(
        [first, second],
        [],
        expect.anything(),
      ),
    )
  })

  it('keeps existing-file selection enabled while Upload needs its separate permission', async () => {
    const file = buildTripFile({ id: 41, original_name: 'saved.pdf' })
    const onAddUploads = vi.fn()
    renderPicker({ files: [file], onAddUploads })

    expect(screen.getByRole('checkbox', { name: 'saved.pdf' })).toBeEnabled()
    await userEvent.click(screen.getByRole('tab', { name: 'Upload' }))
    expect(screen.getByTestId('expense-upload-input')).toBeDisabled()

    fireEvent.drop(screen.getByTestId('expense-upload-dropzone'), {
      dataTransfer: {
        files: [new File(['x'], 'blocked.pdf', { type: 'application/pdf' })],
        types: ['Files'],
      },
    })
    expect(onAddUploads).not.toHaveBeenCalled()
  })

  it('disables both sources when attachment editing is not permitted', async () => {
    const file = buildTripFile({ id: 42, original_name: 'saved.pdf' })
    renderPicker({
      files: [file],
      canAttachFiles: false,
      canUploadFiles: true,
    })

    expect(screen.getByRole('checkbox', { name: 'saved.pdf' })).toBeDisabled()
    await userEvent.click(screen.getByRole('tab', { name: 'Upload' }))
    expect(screen.getByTestId('expense-upload-input')).toBeDisabled()
  })

  it('disables both sources while offline and explains the read-only state', async () => {
    const file = buildTripFile({ id: 43, original_name: 'saved-offline.pdf' })
    renderPicker({ files: [file], canUploadFiles: true, offline: true })

    expect(screen.getByRole('alert')).toHaveTextContent('File relationships cannot be changed while offline.')
    expect(screen.getByRole('checkbox', { name: 'saved-offline.pdf' })).toBeDisabled()
    await userEvent.click(screen.getByRole('tab', { name: 'Upload' }))
    expect(screen.getByTestId('expense-upload-input')).toBeDisabled()
  })
})
