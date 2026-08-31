import { describe, expect, it, vi } from 'vitest'
import userEvent from '@testing-library/user-event'
import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '../../../tests/helpers/render'
import { buildTripFile } from '../../../tests/helpers/factories'
import ExpenseFilePicker, {
  type ExpenseStagedUpload,
} from './ExpenseFilePicker'

const getAuthUrl = vi.fn(async (url: string, _kind: string) => `${url}?token=abc`)

vi.mock('../../api/authUrl', () => ({
  getAuthUrl: (url: string, kind: string) => getAuthUrl(url, kind),
}))

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
  it('keeps the upload icon and label on one line', () => {
    renderPicker({ canUploadFiles: true })

    expect(screen.getByRole('tab', { name: 'Upload' })).toHaveStyle({
      display: 'inline-flex',
      alignItems: 'center',
      gap: '5px',
      whiteSpace: 'nowrap',
    })
  })

  it('labels the existing files as files for this expense', () => {
    renderPicker({ files: [buildTripFile({ id: 40, original_name: 'receipt.pdf' })] })

    expect(screen.getByRole('region', { name: 'Files for this expense' })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: 'Files for this expense' })).toBeInTheDocument()
    expect(screen.queryByRole('tab', { name: 'Trip files' })).not.toBeInTheDocument()
  })

  it('shows image thumbnails and a preview action for every file', async () => {
    const image = buildTripFile({ id: 44, original_name: 'receipt.jpg', mime_type: 'image/jpeg' })
    const pdf = buildTripFile({ id: 45, original_name: 'invoice.pdf' })
    renderPicker({ files: [image, pdf] })

    await waitFor(() => expect(screen.getByTestId('expense-file-row-44').querySelector('img')).not.toBeNull())
    expect(screen.getAllByTestId('expense-file-preview')).toHaveLength(2)
    expect(getAuthUrl).toHaveBeenCalledWith(image.url, 'download')
  })

  it('opens image and document previews from the Files for this expense tab', async () => {
    const image = buildTripFile({ id: 46, original_name: 'receipt.jpg', mime_type: 'image/jpeg' })
    const pdf = buildTripFile({ id: 47, original_name: 'invoice.pdf' })
    renderPicker({ files: [image, pdf] })

    fireEvent.click(within(screen.getByTestId('expense-file-row-46')).getByRole('button', { name: 'Open receipt.jpg' }))
    expect(await screen.findByAltText('receipt.jpg')).toHaveAttribute('src', `${image.url}?token=abc`)

    fireEvent.keyDown(window, { key: 'Escape' })
    fireEvent.click(within(screen.getByTestId('expense-file-row-47')).getByRole('button', { name: 'Open invoice.pdf' }))
    await waitFor(() => expect(screen.getByTitle('invoice.pdf')).toHaveAttribute('data', `${pdf.url}?token=abc#view=FitH`))
  })

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
