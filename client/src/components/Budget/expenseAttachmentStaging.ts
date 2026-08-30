import { useState } from 'react'
import type { TripFile } from '../../types'
import { filesForExpense } from './expenseAttachmentUtils'

export interface ExpenseStagedUpload {
  file: File
  uploadedFile?: TripFile
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
      ...newFiles.map((file) => ({ file })),
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
  selectedFileIds: Set<number>
  stagedUploads: ExpenseStagedUpload[]
  canAttachFiles: boolean
  canUploadFiles: boolean
  addFile: AddFile
  attachExpenseFile: ExpenseFileMutation
  detachExpenseFile: ExpenseFileMutation
  onUploaded: (file: File, uploadedFile: TripFile) => void
  onAttached: (file: File) => void
}

const MAX_CONCURRENT_EXPENSE_UPLOADS = 2

async function runWithConcurrency<T>(
  items: readonly T[],
  worker: (item: T) => Promise<void>,
): Promise<void> {
  let nextIndex = 0
  let failed = false
  let failure: unknown

  const run = async () => {
    while (!failed) {
      const index = nextIndex++
      const item = items[index]
      if (item === undefined) return
      try {
        await worker(item)
      } catch (error: unknown) {
        failed = true
        failure = error
      }
    }
  }

  const workerCount = Math.min(MAX_CONCURRENT_EXPENSE_UPLOADS, items.length)
  await Promise.all(Array.from({ length: workerCount }, () => run()))
  if (failed) throw failure
}

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
  onUploaded,
  onAttached,
}: SaveExpenseFileAttachmentsArgs): Promise<void> {
  if (!canAttachFiles) return

  const savedFileIds = new Set(
    filesForExpense(files, expenseId).map((file) => file.id),
  )
  const fileIdsToDetach = [...savedFileIds].filter(
    (fileId) => !selectedFileIds.has(fileId),
  )
  const fileIdsToAttach = [...selectedFileIds].filter(
    (fileId) => !savedFileIds.has(fileId),
  )

  await Promise.all(
    fileIdsToDetach.map((fileId) =>
      detachExpenseFile(tripId, expenseId, fileId),
    ),
  )
  await Promise.all(
    fileIdsToAttach.map((fileId) =>
      attachExpenseFile(tripId, expenseId, fileId),
    ),
  )

  if (!canUploadFiles) return

  await runWithConcurrency(stagedUploads, async (staged) => {
    let uploadedFile = staged.uploadedFile
    if (!uploadedFile) {
      const formData = new FormData()
      formData.append('file', staged.file)
      uploadedFile = await addFile(tripId, formData)
      onUploaded(staged.file, uploadedFile)
    }
    await attachExpenseFile(tripId, expenseId, uploadedFile.id)
    onAttached(staged.file)
  })
}
