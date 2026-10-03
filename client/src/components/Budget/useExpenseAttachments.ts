import { useEffect, useState } from 'react'
import type { TripFile } from '../../types'
import { useTripStore } from '../../store/tripStore'
import { useToast } from '../shared/Toast'
import { useTranslation } from '../../i18n'
import {
  mergeExpenseAttachmentResult,
  saveExpenseFileAttachments,
  type ExpenseAttachmentFailure,
  type ExpenseAttachmentSaveResult,
  type ExpenseStagedUpload,
} from './expenseAttachmentStaging'
import { filesForExpense } from './expenseAttachmentUtils'

type AddFile = (tripId: number | string, formData: FormData) => Promise<TripFile>
type ExpenseFileMutation = (
  tripId: number | string,
  expenseId: number,
  fileId: number,
) => Promise<TripFile>
type LoadFiles = (tripId: number | string) => Promise<boolean>

interface UseExpenseAttachmentsOptions {
  tripId: number | string
  editingExpenseId?: number | null
  savedExpenseId?: number | null
  files: TripFile[]
  canAttachFiles: boolean
  canUploadFiles: boolean
  addFile: AddFile
  attachExpenseFile: ExpenseFileMutation
  detachExpenseFile: ExpenseFileMutation
  loadFiles: LoadFiles
}

export function useExpenseAttachments({
  tripId,
  editingExpenseId,
  savedExpenseId,
  files,
  canAttachFiles,
  canUploadFiles,
  addFile,
  attachExpenseFile,
  detachExpenseFile,
  loadFiles,
}: UseExpenseAttachmentsOptions) {
  const { t } = useTranslation()
  const toast = useToast()
  const expenseId = editingExpenseId ?? savedExpenseId ?? null
  const [selectionTouched, setSelectionTouched] = useState(false)
  const [selectedFileIds, setSelectedFileIds] = useState<Set<number>>(() =>
    expenseId === null
      ? new Set()
      : new Set(filesForExpense(files, expenseId).map(file => file.id)),
  )
  const [stagedUploads, setStagedUploads] = useState<ExpenseStagedUpload[]>([])
  const [attachmentFailures, setAttachmentFailures] = useState<ExpenseAttachmentFailure[]>([])
  const [retryingAttachmentKey, setRetryingAttachmentKey] = useState<string | null>(null)

  useEffect(() => {
    if (selectionTouched) return
    setSelectedFileIds(
      expenseId === null
        ? new Set()
        : new Set(filesForExpense(files, expenseId).map(file => file.id)),
    )
  }, [expenseId, files, selectionTouched])

  const addStagedUploads = (newFiles: File[]) => {
    if (!canAttachFiles || !canUploadFiles) return
    setStagedUploads(previous => [
      ...previous,
      ...newFiles.map(file => ({ id: crypto.randomUUID(), file })),
    ])
  }

  const removeStagedUpload = (index: number) => {
    if (!canAttachFiles || !canUploadFiles) return
    const staged = stagedUploads[index]
    if (!staged) return
    setAttachmentFailures(previous =>
      previous.filter(failure => failure.stagedUploadId !== staged.id),
    )
    setStagedUploads(previous => previous.filter((_, currentIndex) => currentIndex !== index))
  }

  const toggleFile = (fileId: number) => {
    if (!canAttachFiles) return
    setSelectionTouched(true)
    setSelectedFileIds(previous => {
      const next = new Set(previous)
      if (next.has(fileId)) next.delete(fileId)
      else next.add(fileId)
      return next
    })
  }

  const markStagedUpload = (file: File, uploadedFile: TripFile) => {
    setStagedUploads(previous =>
      previous.map(staged => staged.file === file ? { ...staged, uploadedFile } : staged),
    )
  }

  const removeStagedUploadFile = (file: File) => {
    setStagedUploads(previous => previous.filter(staged => staged.file !== file))
  }

  const recordResult = (result: ExpenseAttachmentSaveResult) => {
    setAttachmentFailures(previous => mergeExpenseAttachmentResult(previous, result))
  }

  const reconcileSavedAttachments = async (savedId: number): Promise<boolean> => {
    try {
      if (!await loadFiles(tripId)) return false
    } catch {
      return false
    }

    const actualFiles = useTripStore.getState().files
    setSelectedFileIds(new Set(filesForExpense(actualFiles, savedId).map(file => file.id)))
    setSelectionTouched(true)
    return true
  }

  const runAttachmentWork = async (
    savedId: number,
    retryOnly?: ExpenseAttachmentFailure,
  ): Promise<ExpenseAttachmentFailure[]> => {
    const result = await saveExpenseFileAttachments({
      tripId,
      expenseId: savedId,
      files,
      selectedFileIds,
      stagedUploads,
      canAttachFiles,
      canUploadFiles,
      addFile,
      attachExpenseFile,
      detachExpenseFile,
      pendingFailures: retryOnly ? [] : attachmentFailures,
      retryOnly,
      onUploaded: markStagedUpload,
      onAttached: removeStagedUploadFile,
    })
    recordResult(result)
    return mergeExpenseAttachmentResult(attachmentFailures, result)
  }

  const saveAttachments = async (
    savedId: number,
    retryOnly?: ExpenseAttachmentFailure,
  ): Promise<boolean> => {
    try {
      const nextFailures = await runAttachmentWork(savedId, retryOnly)
      if (nextFailures.length === 0) return true
    } catch {
      // Show one actionable message below; keep the user's current selection.
    }

    await reconcileSavedAttachments(savedId)
    toast.error(t('costs.attachmentsSaveError'))
    return false
  }

  const retryAttachment = async (
    failure: ExpenseAttachmentFailure,
    savedId: number,
  ): Promise<boolean> => {
    if (retryingAttachmentKey !== null) return false
    setRetryingAttachmentKey(failure.key)
    try {
      return await saveAttachments(savedId, failure)
    } finally {
      setRetryingAttachmentKey(null)
    }
  }

  return {
    selectedFileIds,
    stagedUploads,
    attachmentFailures,
    retryingAttachmentKey,
    addStagedUploads,
    removeStagedUpload,
    toggleFile,
    saveAttachments,
    retryAttachment,
  }
}
