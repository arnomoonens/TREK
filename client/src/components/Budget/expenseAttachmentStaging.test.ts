import { describe, expect, it, vi } from 'vitest'
import { buildTripFile } from '../../../tests/helpers/factories'
import {
  saveExpenseFileAttachments,
  type ExpenseStagedUpload,
} from './expenseAttachmentStaging'

describe('saveExpenseFileAttachments', () => {
  it('isolates direct detach and attach operations and returns both outcomes', async () => {
    const attached = buildTripFile({ id: 1, original_name: 'old.pdf', linked_expense_ids: [10] })
    const available = buildTripFile({ id: 2, original_name: 'new.pdf', linked_expense_ids: [] })
    let detachAttempts = 0
    const detachExpenseFile = vi.fn(async () => {
      detachAttempts += 1
      if (detachAttempts === 1) throw new Error('detach failed')
      return attached
    })
    const attachExpenseFile = vi.fn(async () => available)

    const result = await saveExpenseFileAttachments({
      tripId: 1,
      expenseId: 10,
      files: [attached, available],
      selectedFileIds: new Set([available.id]),
      stagedUploads: [],
      canAttachFiles: true,
      canUploadFiles: false,
      addFile: vi.fn(),
      attachExpenseFile,
      detachExpenseFile,
      onUploaded: vi.fn(),
      onAttached: vi.fn(),
    })

    expect(result.failures).toEqual([
      expect.objectContaining({ kind: 'detach', fileId: attached.id, fileName: attached.original_name }),
    ])
    expect(result.succeeded).toEqual([
      expect.objectContaining({ kind: 'attach', fileId: available.id, fileName: available.original_name }),
    ])

    const retry = await saveExpenseFileAttachments({
      tripId: 1,
      expenseId: 10,
      files: [attached, { ...available, linked_expense_ids: [10] }],
      selectedFileIds: new Set([available.id]),
      stagedUploads: [],
      canAttachFiles: true,
      canUploadFiles: false,
      addFile: vi.fn(),
      attachExpenseFile,
      detachExpenseFile,
      retryOnly: result.failures[0],
      onUploaded: vi.fn(),
      onAttached: vi.fn(),
    })

    expect(retry.failures).toEqual([])
    expect(detachExpenseFile).toHaveBeenCalledTimes(2)
    expect(attachExpenseFile).toHaveBeenCalledTimes(1)
  })

  it('continues after an upload failure and retries that staged upload without repeating success', async () => {
    const first = new File(['first'], 'first.pdf', { type: 'application/pdf' })
    const second = new File(['second'], 'second.pdf', { type: 'application/pdf' })
    const stagedUploads: ExpenseStagedUpload[] = [
      { id: 'stage-first', file: first },
      { id: 'stage-second', file: second },
    ]
    let firstAttempts = 0
    let nextId = 20
    const addFile = vi.fn(async (_tripId: number, formData: FormData) => {
      const file = formData.get('file') as File
      if (file.name === first.name && firstAttempts++ === 0) throw new Error('upload failed')
      return buildTripFile({ id: nextId++, original_name: file.name })
    })
    const attachExpenseFile = vi.fn(async (_tripId: number, _expenseId: number, fileId: number) =>
      buildTripFile({ id: fileId, linked_expense_ids: [10] }))

    const result = await saveExpenseFileAttachments({
      tripId: 1,
      expenseId: 10,
      files: [],
      selectedFileIds: new Set(),
      stagedUploads,
      canAttachFiles: true,
      canUploadFiles: true,
      addFile,
      attachExpenseFile,
      detachExpenseFile: vi.fn(),
      onUploaded: vi.fn(),
      onAttached: vi.fn(),
    })

    expect(result.failures).toEqual([
      expect.objectContaining({ kind: 'upload', stagedUploadId: 'stage-first', fileName: first.name }),
    ])
    expect(attachExpenseFile).toHaveBeenCalledTimes(1)

    const retry = await saveExpenseFileAttachments({
      tripId: 1,
      expenseId: 10,
      files: [],
      selectedFileIds: new Set(),
      stagedUploads,
      canAttachFiles: true,
      canUploadFiles: true,
      addFile,
      attachExpenseFile,
      detachExpenseFile: vi.fn(),
      retryOnly: result.failures[0],
      onUploaded: vi.fn(),
      onAttached: vi.fn(),
    })

    expect(retry.failures).toEqual([])
    expect(addFile).toHaveBeenCalledTimes(3)
    expect(attachExpenseFile).toHaveBeenCalledTimes(2)
    expect(attachExpenseFile.mock.calls.map(call => call[2])).toEqual([20, 21])
  })

  it('keeps the uploaded File ID when its attach fails and retries attach only', async () => {
    const source = new File(['receipt'], 'receipt.pdf', { type: 'application/pdf' })
    const uploaded = buildTripFile({ id: 30, original_name: source.name })
    const initialStage: ExpenseStagedUpload = { id: 'stage-receipt', file: source }
    let attachAttempts = 0
    const addFile = vi.fn(async () => uploaded)
    const attachExpenseFile = vi.fn(async () => {
      attachAttempts += 1
      if (attachAttempts === 1) throw new Error('attach failed')
      return { ...uploaded, linked_expense_ids: [10] }
    })

    const result = await saveExpenseFileAttachments({
      tripId: 1,
      expenseId: 10,
      files: [],
      selectedFileIds: new Set(),
      stagedUploads: [initialStage],
      canAttachFiles: true,
      canUploadFiles: true,
      addFile,
      attachExpenseFile,
      detachExpenseFile: vi.fn(),
      onUploaded: vi.fn(),
      onAttached: vi.fn(),
    })
    const retryStage: ExpenseStagedUpload = { ...initialStage, uploadedFile: uploaded }

    expect(result.failures).toEqual([
      expect.objectContaining({ kind: 'attach', fileId: uploaded.id, stagedUploadId: initialStage.id }),
    ])

    const retry = await saveExpenseFileAttachments({
      tripId: 1,
      expenseId: 10,
      files: [uploaded],
      selectedFileIds: new Set(),
      stagedUploads: [retryStage],
      canAttachFiles: true,
      canUploadFiles: true,
      addFile,
      attachExpenseFile,
      detachExpenseFile: vi.fn(),
      retryOnly: result.failures[0],
      onUploaded: vi.fn(),
      onAttached: vi.fn(),
    })

    expect(retry.failures).toEqual([])
    expect(addFile).toHaveBeenCalledTimes(1)
    expect(attachExpenseFile).toHaveBeenCalledTimes(2)
  })
})
