import { useState, useCallback, useEffect, useRef } from 'react'
import { useDropzone } from 'react-dropzone'
import { useToast } from '../shared/Toast'
import { useTranslation, translateApiError } from '../../i18n'
import { filesApi } from '../../api/client'
import type { BudgetItem, Place, Reservation, Trip, TripFile, Day, AssignmentsMap } from '../../types'
import { useCanDo } from '../../store/permissionsStore'
import { useTripStore } from '../../store/tripStore'
import { useNetworkMode } from '../../hooks/useNetworkMode'
import { getAuthUrl } from '../../api/authUrl'
import { fileErrorMessage, isImage, isMedia, isWalletPass } from './FileManager.helpers'
import { openFile as openFileInTab } from '../../utils/fileDownload'
import { getCachedFileObjectUrl, isOfflineFileUnavailableError } from '../../utils/offlineFile'
import { linkedExpenseCount } from '../Budget/expenseAttachmentUtils'

export interface FileManagerProps {
  files?: TripFile[]
  onUpload: (fd: FormData) => Promise<any>
  onDelete: (fileId: number) => Promise<void>
  onUpdate?: () => Promise<void> | void
  places: Place[]
  days?: Day[]
  assignments?: AssignmentsMap
  reservations?: Reservation[]
  expenses: BudgetItem[]
  /** Explicit trip context is required by the standalone Files route. */
  trip: Trip | null
  tripId: number
  allowedFileTypes?: string | null
}

/**
 * File manager state: upload (dropzone + paste), star/trash/restore, the
 * filter tabs, lightbox + PDF preview and the assign-to-place/reservation
 * modal. Kept in one hook so FileManager renders as thin layout sections.
 */
export function useFileManager({ files = [], onUpload, onDelete, onUpdate, places, days = [], assignments = {}, reservations = [], expenses, trip, tripId, allowedFileTypes }: FileManagerProps) {
  const [uploading, setUploading] = useState(false)
  const [filterType, setFilterType] = useState('all')
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null)
  const [showTrash, setShowTrash] = useState(false)
  const [trashFiles, setTrashFiles] = useState<TripFile[]>([])
  const [loadingTrash, setLoadingTrash] = useState(false)
  const toast = useToast()
  const toastRef = useRef(toast)
  toastRef.current = toast
  const can = useCanDo()
  const { offline } = useNetworkMode()
  const filesAvailability = useTripStore((s) => s.filesAvailability)
  const attachExpenseFile = useTripStore((s) => s.attachExpenseFile)
  const detachExpenseFile = useTripStore((s) => s.detachExpenseFile)
  const { t, locale } = useTranslation()

  const loadTrash = useCallback(async () => {
    if (offline) {
      toast.error(t('files.offlineListUnavailable'))
      return
    }
    setLoadingTrash(true)
    try {
      const data = await filesApi.list(tripId, true)
      setTrashFiles(data.files || [])
    } catch {
      toast.error(t('files.toast.deleteError'))
    }
    setLoadingTrash(false)
  }, [tripId, t, toast, offline])

  const toggleTrash = useCallback(() => {
    if (!showTrash) void loadTrash()
    setShowTrash(v => !v)
  }, [showTrash, loadTrash])

  // onUpdate is the refresh signal towards the legacy file-link controls.
  const refreshFiles = useCallback(async () => {
    await onUpdate?.()
  }, [onUpdate])

  const handleStar = async (fileId: number) => {
    try {
      await filesApi.toggleStar(tripId, fileId)
      await refreshFiles()
    } catch {
      toast.error(t('files.toast.assignError'))
    }
  }

  const handleRestore = async (fileId: number) => {
    try {
      await filesApi.restore(tripId, fileId)
      setTrashFiles(prev => prev.filter(f => f.id !== fileId))
      await refreshFiles()
      toast.success(t('files.toast.restored'))
    } catch {
      toast.error(t('files.toast.restoreError'))
    }
  }

  const handlePermanentDelete = async (fileId: number) => {
    const file = trashFiles.find(candidate => candidate.id === fileId)
    const linkedExpenses = file ? linkedExpenseCount(file, expenses) : 0
    const message = linkedExpenses === 0
      ? t('files.confirm.permanentDelete')
      : t(linkedExpenses === 1 ? 'files.confirm.permanentDeleteWithExpense' : 'files.confirm.permanentDeleteWithExpenses', { count: linkedExpenses })
    if (!confirm(message)) return
    try {
      await filesApi.permanentDelete(tripId, fileId)
      setTrashFiles(prev => prev.filter(f => f.id !== fileId))
      toast.success(t('files.toast.deleted'))
    } catch {
      toast.error(t('files.toast.deleteError'))
    }
  }

  const handleEmptyTrash = async () => {
    if (!confirm(t('files.confirm.emptyTrash'))) return
    try {
      await filesApi.emptyTrash(tripId)
      setTrashFiles([])
      toast.success(t('files.toast.trashEmptied') || 'Trash emptied')
    } catch {
      toast.error(t('files.toast.deleteError'))
    }
  }

  const [previewFile, setPreviewFile] = useState<TripFile | null>(null)
  const [previewFileUrl, setPreviewFileUrl] = useState('')
  const [previewUnavailable, setPreviewUnavailable] = useState(false)
  const [assignFileId, setAssignFileId] = useState<number | null>(null)

  const onDrop = useCallback(async (acceptedFiles) => {
    if (acceptedFiles.length === 0) return
    if (offline) {
      toast.error(t('files.offlineReadOnly'))
      return
    }
    setUploading(true)
    const uploadedIds: number[] = []
    try {
      for (const file of acceptedFiles) {
        const formData = new FormData()
        formData.append('file', file)
        const result = await onUpload(formData)
        const fileObj = result?.file || result
        if (fileObj?.id) uploadedIds.push(fileObj.id)
      }
      toast.success(t('files.uploaded', { count: acceptedFiles.length }))
      // Open assign modal for the last uploaded file
      const lastId = uploadedIds[uploadedIds.length - 1]
      if (lastId && (places.length > 0 || reservations.length > 0 || expenses.length > 0)) {
        setAssignFileId(lastId)
      }
    } catch (err) {
      toast.error(translateApiError(t, err, 'files.uploadError'))
    } finally {
      setUploading(false)
    }
  }, [onUpload, toast, t, places, reservations, expenses, offline])

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    maxSize: 50 * 1024 * 1024,
    noClick: false,
    disabled: offline,
  })

  const handlePaste = useCallback((e: React.ClipboardEvent) => {
    if (offline || !can('file_upload', trip)) return
    const items = e.clipboardData?.items
    if (!items) return
    const pastedFiles: File[] = []
    for (const item of Array.from(items)) {
      if (item.kind === 'file') {
        const file = item.getAsFile()
        if (file) pastedFiles.push(file)
      }
    }
    if (pastedFiles.length > 0) {
      e.preventDefault()
      void onDrop(pastedFiles)
    }
  }, [onDrop, can, trip, offline])

  const filteredFiles = files.filter(f => {
    if (filterType === 'starred') return !!f.starred
    if (filterType === 'pdf') return f.mime_type === 'application/pdf'
    if (filterType === 'image') return isImage(f.mime_type)
    if (filterType === 'doc') return (f.mime_type || '').includes('word') || (f.mime_type || '').includes('excel') || (f.mime_type || '').includes('text')
    if (filterType === 'collab') return !!f.note_id
    return true
  })

  const handleDelete = async (id) => {
    const file = files.find(candidate => candidate.id === id)
    const linkedExpenses = file ? linkedExpenseCount(file, expenses) : 0
    const message = linkedExpenses === 0
      ? t('files.confirm.delete')
      : t(linkedExpenses === 1 ? 'files.confirm.deleteWithExpense' : 'files.confirm.deleteWithExpenses', { count: linkedExpenses })
    if (!confirm(message)) return
    try {
      await onDelete(id)
      toast.success(t('files.toast.trashed') || 'Moved to trash')
    } catch {
      toast.error(t('files.toast.deleteError'))
    }
  }

  const previewUrl = previewFile?.url
  useEffect(() => {
    let objectUrl = ''
    if (previewUrl) {
      let current = true
      setPreviewFileUrl('')
      setPreviewUnavailable(false)
      if (offline) {
        getCachedFileObjectUrl(previewUrl)
          .then(url => {
            if (current) {
              objectUrl = url
              setPreviewFileUrl(url)
            } else {
              URL.revokeObjectURL(url)
            }
          })
          .catch(error => {
            if (current && isOfflineFileUnavailableError(error)) setPreviewUnavailable(true)
          })
        return () => {
          current = false
          if (objectUrl) URL.revokeObjectURL(objectUrl)
        }
      }
      getAuthUrl(previewUrl, 'download')
        .then(url => { if (current) setPreviewFileUrl(url) })
        .catch(error => { if (current) toastRef.current.error(fileErrorMessage(t, error)) })
      return () => {
        current = false
        if (objectUrl) URL.revokeObjectURL(objectUrl)
      }
    } else {
      setPreviewFileUrl('')
      setPreviewUnavailable(false)
    }
  }, [previewUrl, t, offline])

  const handleAssign = async (fileId: number, data: { place_id?: number | null; reservation_id?: number | null }) => {
    if (offline) return
    try {
      await filesApi.update(tripId, fileId, data)
      await refreshFiles()
    } catch {
      toast.error(t('files.toast.assignError'))
    }
  }

  // Image OR video — both open in the lightbox; videos play there (#823).
  const mediaFiles = filteredFiles.filter(f => isMedia(f.mime_type))

  const openFile = (file) => {
    if (isMedia(file.mime_type)) {
      const idx = mediaFiles.findIndex(f => f.id === file.id)
      setLightboxIndex(idx >= 0 ? idx : 0)
    } else if (isWalletPass(file.mime_type, file.original_name)) {
      // Download so the OS hands the pass to Apple Wallet (#1447) rather than
      // forcing it into the in-app PDF preview.
      openFileInTab(file.url, file.original_name).catch(error => toast.error(fileErrorMessage(t, error)))
    } else {
      setPreviewFile(file)
    }
  }

  return {
    files, places, days, assignments, reservations, expenses, tripId, allowedFileTypes,
    uploading, filterType, setFilterType, lightboxIndex, setLightboxIndex,
    showTrash, trashFiles, loadingTrash, toast, can, trip, t, locale,
    attachExpenseFile, detachExpenseFile,
    toggleTrash, refreshFiles, handleStar, handleRestore, handlePermanentDelete, handleEmptyTrash,
    previewFile, setPreviewFile, previewFileUrl, previewUnavailable, assignFileId, setAssignFileId,
    getRootProps, getInputProps, isDragActive, handlePaste, filteredFiles, handleDelete,
    handleAssign, mediaFiles, openFile, offline, filesAvailability,
  }
}

export type FileManagerState = ReturnType<typeof useFileManager>

/** The small state surface shared by the Files previews and read-only viewers. */
export type FilePreviewState = Pick<FileManagerState, 'previewFile' | 'setPreviewFile' | 'previewFileUrl' | 'toast' | 't'> & {
  previewUnavailable?: boolean
}
