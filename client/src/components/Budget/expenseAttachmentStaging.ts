import { useState } from 'react'
import type { TripFile } from '../../types'
import { filesForExpense } from './expenseAttachmentUtils'

let nextStagedUploadId = 0

export interface ExpenseStagedUpload {
  id: string
  file: File
  uploadedFile?: TripFile
}

export type ExpenseAttachmentOperationKind = 'attach' | 'detach' | 'upload'

export interface ExpenseAttachmentOperation {
  key: string
  kind: ExpenseAttachmentOperationKind
  fileName: string
  fileId?: number
  stagedUploadId?: string
}

export interface ExpenseAttachmentFailure extends ExpenseAttachmentOperation {
  error?: string
}

export interface ExpenseAttachmentSaveResult {
  succeeded: ExpenseAttachmentOperation[]
  failures: ExpenseAttachmentFailure[]
}

export function expenseAttachmentOperationKey(
  kind: ExpenseAttachmentOperationKind,
  identifier: number | string,
): string {
  return `${kind}:${identifier}`
}

function createStagedUploadId(): string {
  nextStagedUploadId += 1
  return `staged-upload-${nextStagedUploadId}`
}

export function useExpenseFileStaging(
  canAttachFiles: boolean,
  canUploadFiles: boolean,
) {
  const [stagedUploads, setStagedUploads] = useState<ExpenseStagedUpload[]>([])

  const addStagedUploads = (newFiles: File[]) => {
    if (!canAttachFiles || !canUploadFiles) return
    setStagedUploads((previous) => [
      ...previous,
      ...newFiles.map((file) => ({ id: createStagedUploadId(), file })),
    ])
  }

  const removeStagedUpload = (index: number) => {
    if (!canAttachFiles || !canUploadFiles) return
    setStagedUploads((previous) =>
      previous.filter((_, currentIndex) => currentIndex !== index),
    )
  }

  const markStagedUpload = (file: File, uploadedFile: TripFile) => {
    setStagedUploads((previous) =>
      previous.map((staged) =>
        staged.file === file ? { ...staged, uploadedFile } : staged,
      ),
    )
  }

  const removeStagedUploadFile = (file: File) => {
    setStagedUploads((previous) =>
      previous.filter((staged) => staged.file !== file),
    )
  }

  return {
    stagedUploads,
    addStagedUploads,
    removeStagedUpload,
    markStagedUpload,
    removeStagedUploadFile,
  }
}

export function mergeExpenseAttachmentResult(
  previousFailures: readonly ExpenseAttachmentFailure[],
  result: ExpenseAttachmentSaveResult,
): ExpenseAttachmentFailure[] {
  const handledKeys = new Set([
    ...result.succeeded.map((operation) => operation.key),
    ...result.failures.map((operation) => operation.key),
  ])
  const remaining = previousFailures.filter(
    (failure) => !handledKeys.has(failure.key),
  )
  const seenKeys = new Set<string>()
  return [...remaining, ...result.failures].filter((failure) => {
    if (seenKeys.has(failure.key)) return false
    seenKeys.add(failure.key)
    return true
  })
}

export function useExpenseAttachmentRecovery() {
  const [attachmentFailures, setAttachmentFailures] = useState<ExpenseAttachmentFailure[]>([])

  const recordResult = (result: ExpenseAttachmentSaveResult) => {
    setAttachmentFailures((previous) => mergeExpenseAttachmentResult(previous, result))
  }

  const forgetStagedUpload = (stagedUploadId: string) => {
    setAttachmentFailures((previous) =>
      previous.filter((failure) => failure.stagedUploadId !== stagedUploadId),
    )
  }

  return {
    attachmentFailures,
    recordResult,
    forgetStagedUpload,
  }
}

type AddFile = (
  tripId: number | string,
  formData: FormData,
) => Promise<TripFile>
type ExpenseFileMutation = (
  tripId: number | string,
  expenseId: number,
  fileId: number,
) => Promise<TripFile>

interface SaveExpenseFileAttachmentsArgs {
  tripId: number | string
  expenseId: number
  files: TripFile[]
  selectedFileIds: ReadonlySet<number>
  stagedUploads: ExpenseStagedUpload[]
  canAttachFiles: boolean
  canUploadFiles: boolean
  addFile: AddFile
  attachExpenseFile: ExpenseFileMutation
  detachExpenseFile: ExpenseFileMutation
  pendingFailures?: readonly ExpenseAttachmentFailure[]
  retryOnly?: ExpenseAttachmentFailure
  onUploaded: (file: File, uploadedFile: TripFile) => void
  onAttached: (file: File) => void
}

function operation(
  kind: ExpenseAttachmentOperationKind,
  fileName: string,
  options: { fileId?: number; stagedUploadId?: string },
): ExpenseAttachmentOperation {
  const identifier = options.stagedUploadId ?? options.fileId
  if (identifier === undefined) {
    throw new Error(`Missing identifier for ${kind} operation`)
  }
  return {
    key: expenseAttachmentOperationKey(kind, identifier),
    kind,
    fileName,
    ...options,
  }
}

function failureFor(
  current: ExpenseAttachmentOperation,
  error: unknown,
): ExpenseAttachmentFailure {
  return {
    ...current,
    error: error instanceof Error ? error.message : String(error),
  }
}

function uniqueOperations(
  operations: readonly ExpenseAttachmentOperation[],
): ExpenseAttachmentOperation[] {
  const seen = new Set<string>()
  return operations.filter((current) => {
    if (seen.has(current.key)) return false
    seen.add(current.key)
    return true
  })
}

const MAX_CONCURRENT_EXPENSE_UPLOADS = 2

async function runWithConcurrency<T>(
  items: readonly T[],
  worker: (item: T) => Promise<void>,
): Promise<void> {
  let nextIndex = 0
  const run = async () => {
    while (true) {
      const index = nextIndex++
      const item = items[index]
      if (item === undefined) return
      await worker(item)
    }
  }

  const workerCount = Math.min(MAX_CONCURRENT_EXPENSE_UPLOADS, items.length)
  await Promise.all(Array.from({ length: workerCount }, () => run()))
}

function fileNameForId(files: readonly TripFile[], fileId: number): string {
  return files.find((file) => file.id === fileId)?.original_name ?? String(fileId)
}

/**
 * Saves the Expense's file relationship as an operation journal. Every
 * operation is isolated so a later failure cannot erase an earlier success.
 * The caller owns the journal state and can pass failed operations back for a
 * normal save or retry one operation through `retryOnly`.
 */
export async function saveExpenseFileAttachments({
  tripId,
  expenseId,
  files,
  selectedFileIds,
  stagedUploads,
  canAttachFiles,
  canUploadFiles,
  addFile,
  attachExpenseFile,
  detachExpenseFile,
  pendingFailures = [],
  retryOnly,
  onUploaded,
  onAttached,
}: SaveExpenseFileAttachmentsArgs): Promise<ExpenseAttachmentSaveResult> {
  const emptyResult: ExpenseAttachmentSaveResult = { succeeded: [], failures: [] }
  if (!canAttachFiles) return emptyResult

  const succeeded: ExpenseAttachmentOperation[] = []
  const failures: ExpenseAttachmentFailure[] = []
  const forcedFailures = retryOnly ? [retryOnly] : pendingFailures

  const runDirectOperation = async (current: ExpenseAttachmentOperation) => {
    try {
      if (current.fileId === undefined) throw new Error('Missing File ID')
      if (current.kind === 'detach') {
        await detachExpenseFile(tripId, expenseId, current.fileId)
      } else {
        await attachExpenseFile(tripId, expenseId, current.fileId)
      }
      succeeded.push(current)
    } catch (error: unknown) {
      failures.push(failureFor(current, error))
    }
  }

  const savedFileIds = new Set(
    filesForExpense(files, expenseId).map((file) => file.id),
  )
  const desiredDirectOperations = retryOnly
    ? retryOnly.stagedUploadId
      ? []
      : [retryOnly]
    : [
        ...[...savedFileIds]
          .filter((fileId) => !selectedFileIds.has(fileId))
          .map((fileId) => operation('detach', fileNameForId(files, fileId), { fileId })),
        ...[...selectedFileIds]
          .filter((fileId) => !savedFileIds.has(fileId))
          .map((fileId) => operation('attach', fileNameForId(files, fileId), { fileId })),
      ]
  const pendingDirectOperations = forcedFailures
    .filter((failure) => !failure.stagedUploadId)
    .map((failure) => failure as ExpenseAttachmentOperation)
  for (const current of uniqueOperations([...desiredDirectOperations, ...pendingDirectOperations])) {
    await runDirectOperation(current)
  }

  if (!canUploadFiles) {
    return { succeeded, failures }
  }

  const stagedForRetry = retryOnly
    ? retryOnly.stagedUploadId
      ? stagedUploads.filter((staged) => staged.id === retryOnly.stagedUploadId)
      : []
    : stagedUploads
  const forcedForStage = (staged: ExpenseStagedUpload) =>
    forcedFailures.filter((failure) => failure.stagedUploadId === staged.id)
  const pendingAttachForStage = (staged: ExpenseStagedUpload) =>
    forcedForStage(staged).find((failure) => failure.kind === 'attach')
  const pendingUploadForStage = (staged: ExpenseStagedUpload) =>
    forcedForStage(staged).find((failure) => failure.kind === 'upload')

  const runStagedUpload = async (staged: ExpenseStagedUpload) => {
    const stageFailures = forcedForStage(staged)
    const retryingStage = Boolean(retryOnly?.stagedUploadId)
    const retryingUpload = retryOnly?.key === expenseAttachmentOperationKey('upload', staged.id)
    let uploadedFile = staged.uploadedFile

    // An attach failure always carries the uploaded File ID. That lets a retry
    // attach the retained trip File even if the React state update for the
    // staged row has not landed yet.
    const retainedFileId = pendingAttachForStage(staged)?.fileId ??
      (retryOnly?.stagedUploadId === staged.id && retryOnly.kind === 'attach' ? retryOnly.fileId : undefined)
    if (!uploadedFile && retainedFileId !== undefined) {
      uploadedFile = files.find((file) => file.id === retainedFileId) ?? { id: retainedFileId } as TripFile
    }

    if (!uploadedFile && (!retryingStage || retryingUpload || pendingUploadForStage(staged))) {
      const uploadOperation = operation('upload', staged.file.name, { stagedUploadId: staged.id })
      try {
        const formData = new FormData()
        formData.append('file', staged.file)
        uploadedFile = await addFile(tripId, formData)
        succeeded.push(uploadOperation)
        onUploaded(staged.file, uploadedFile)
      } catch (error: unknown) {
        failures.push(failureFor(uploadOperation, error))
        return
      }
    }

    if (!uploadedFile) {
      // A retry can only be actionable while the staged row or retained File is
      // present. Keep the operation visible if a caller supplied stale state.
      const current = retryOnly ?? stageFailures[0]
      if (current) failures.push(current)
      return
    }

    const attachOperation = operation('attach', staged.file.name, {
      fileId: uploadedFile.id,
      stagedUploadId: staged.id,
    })
    const shouldRunAttach = !retryOnly || retryOnly.kind === 'attach' || retryingUpload || !retryingStage
    if (!shouldRunAttach) return
    try {
      await attachExpenseFile(tripId, expenseId, uploadedFile.id)
      succeeded.push(attachOperation)
      onAttached(staged.file)
    } catch (error: unknown) {
      failures.push(failureFor(attachOperation, error))
    }
  }

  await runWithConcurrency(stagedForRetry, runStagedUpload)

  return { succeeded, failures }
}
