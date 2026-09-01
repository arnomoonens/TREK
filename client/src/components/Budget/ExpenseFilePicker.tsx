import { useEffect, useMemo, useRef, useState } from 'react'
import { useDropzone } from 'react-dropzone'
import { Eye, Paperclip, Upload, X } from 'lucide-react'
import { useTranslation } from '../../i18n'
import { useToast } from '../shared/Toast'
import type { TripFile } from '../../types'
import { getAuthUrl } from '../../api/authUrl'
import { openFile as openFileInTab } from '../../utils/fileDownload'
import { AuthedImg } from '../Files/FileManagerAuthedImg'
import { ImageLightbox } from '../Files/FileManagerImageLightbox'
import { MarkdownPreviewModal } from '../Files/FileManagerMarkdownPreviewModal'
import { PdfPreviewModal } from '../Files/FileManagerPdfPreviewModal'
import type { FilePreviewState } from '../Files/useFileManager'
import { fileErrorMessage, formatSize, getFileIcon, isImage, isMarkdown, isMedia, isWalletPass } from '../Files/FileManager.helpers'
import type {
  ExpenseAttachmentFailure,
  ExpenseStagedUpload,
} from './expenseAttachmentStaging'

export type { ExpenseStagedUpload } from './expenseAttachmentStaging'

interface ExpenseFilePickerProps {
  files: TripFile[]
  selectedFileIds: Set<number>
  onToggleFile: (fileId: number) => void
  stagedUploads: ExpenseStagedUpload[]
  onAddUploads: (files: File[]) => void
  onRemoveUpload: (index: number) => void
  canAttachFiles?: boolean
  canUploadFiles?: boolean
  attachmentFailures?: readonly ExpenseAttachmentFailure[]
  onRetryAttachment?: (failure: ExpenseAttachmentFailure) => void
  retryingAttachmentKey?: string | null
  disabled?: boolean
}

type PickerTab = 'upload' | 'expense-files'

/** Existing File selection and new-upload staging for an expense. */
export default function ExpenseFilePicker({
  files,
  selectedFileIds,
  onToggleFile,
  stagedUploads,
  onAddUploads,
  onRemoveUpload,
  canAttachFiles = true,
  canUploadFiles = false,
  attachmentFailures = [],
  onRetryAttachment,
  retryingAttachmentKey = null,
  disabled = false,
}: ExpenseFilePickerProps) {
  const { t } = useTranslation()
  const toast = useToast()
  const toastRef = useRef(toast)
  toastRef.current = toast
  const [activeTab, setActiveTab] = useState<PickerTab>('expense-files')
  const [previewFile, setPreviewFile] = useState<TripFile | null>(null)
  const [previewFileUrl, setPreviewFileUrl] = useState('')
  const [previewError, setPreviewError] = useState(false)
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null)
  const liveFiles = useMemo(() => files.filter(file => !file.deleted_at), [files])
  const mediaFiles = useMemo(() => liveFiles.filter(file => isMedia(file.mime_type)), [liveFiles])
  const attachEnabled = canAttachFiles && !disabled
  const uploadEnabled = attachEnabled && canUploadFiles
  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop: onAddUploads,
    multiple: true,
    disabled: !uploadEnabled,
  })

  const retryLabel = (failure: ExpenseAttachmentFailure) =>
    `${t('costs.retryAttachment')} ${failure.fileName}`
  const retry = (failure: ExpenseAttachmentFailure) => {
    if (!onRetryAttachment || retryingAttachmentKey === failure.key) return
    onRetryAttachment(failure)
  }

  const previewUrl = previewFile?.url
  useEffect(() => {
    if (!previewUrl) {
      setPreviewFileUrl('')
      setPreviewError(false)
      return
    }
    let current = true
    setPreviewFileUrl('')
    setPreviewError(false)
    const resolve = getAuthUrl(previewUrl, 'download')
    resolve
      .then(url => {
        if (current) setPreviewFileUrl(url)
      })
      .catch(() => {
        if (!current) return
        setPreviewError(true)
        toastRef.current.error(t('files.openError'))
      })
    return () => {
      current = false
    }
  }, [previewUrl, t])

  const openFile = (file: TripFile) => {
    if (isMedia(file.mime_type)) {
      const index = mediaFiles.findIndex(candidate => candidate.id === file.id)
      setLightboxIndex(index >= 0 ? index : 0)
      return
    }
    if (isWalletPass(file.mime_type, file.original_name)) {
      openFileInTab(file.url, file.original_name).catch(error => toastRef.current.error(fileErrorMessage(t, error)))
      return
    }
    setPreviewFile(file)
  }

  const previewState: FilePreviewState = {
    previewFile,
    setPreviewFile,
    previewFileUrl: previewError ? '' : previewFileUrl,
    toast,
    t,
  }

  return (
    <>
      <section className="rounded-2xl border border-edge bg-surface-secondary p-4" aria-labelledby="expense-files-title">
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 9, marginBottom: 10 }}>
        <Paperclip size={16} className="text-content-muted" style={{ marginTop: 2, flexShrink: 0 }} />
        <div>
          <div id="expense-files-title" className="text-content" style={{ fontSize: 'calc(13px * var(--fs-scale-body, 1))', fontWeight: 650 }}>
            {t('costs.filesForExpense')}
          </div>
          <div className="text-content-faint" style={{ fontSize: 'calc(11.5px * var(--fs-scale-caption, 1))', lineHeight: 1.45, marginTop: 3 }}>
            {t('costs.filesForExpenseHint')}
          </div>
        </div>
      </div>

      {attachmentFailures.length > 0 && (
        <div
          role="alert"
          data-testid="expense-attachment-failure-summary"
          className="border border-edge bg-surface-card text-content"
          style={{ borderRadius: 10, padding: '8px 10px', marginBottom: 10, fontSize: 'calc(12px * var(--fs-scale-body, 1))' }}
        >
          {t(attachmentFailures.length === 1 ? 'costs.attachmentFailure' : 'costs.attachmentsFailure', { count: attachmentFailures.length })}
        </div>
      )}

      <div role="tablist" style={{ display: 'flex', gap: 4, marginBottom: 10, borderBottom: '1px solid var(--border-primary)' }}>
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'upload'}
          onClick={() => setActiveTab('upload')}
          className={activeTab === 'upload' ? 'text-content border-b-2' : 'text-content-muted'}
          style={{ display: 'inline-flex', alignItems: 'center', gap: 5, whiteSpace: 'nowrap', padding: '6px 10px 8px', border: 0, borderBottomColor: activeTab === 'upload' ? 'var(--text-primary)' : 'transparent', background: 'none', cursor: 'pointer', fontFamily: 'inherit', fontSize: 'calc(12px * var(--fs-scale-body, 1))', fontWeight: 650 }}
        >
          <Upload size={13} style={{ flexShrink: 0 }} />
          {t('costs.uploadFiles')}
          {stagedUploads.length > 0 && ` (${stagedUploads.length})`}
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'expense-files'}
          onClick={() => setActiveTab('expense-files')}
          className={activeTab === 'expense-files' ? 'text-content border-b-2' : 'text-content-muted'}
          style={{ padding: '6px 10px 8px', border: 0, borderBottomColor: activeTab === 'expense-files' ? 'var(--text-primary)' : 'transparent', background: 'none', cursor: 'pointer', fontFamily: 'inherit', fontSize: 'calc(12px * var(--fs-scale-body, 1))', fontWeight: 650 }}
        >
          {t('costs.filesForExpense')}
          {selectedFileIds.size > 0 && ` (${selectedFileIds.size})`}
        </button>
      </div>

      {activeTab === 'upload' ? (
        <div role="tabpanel" aria-label={t('costs.uploadFiles')}>
          <div
            {...getRootProps()}
            data-testid="expense-upload-dropzone"
            style={{
              border: '2px dashed', borderRadius: 12, padding: '18px 12px', textAlign: 'center',
              cursor: uploadEnabled ? 'pointer' : 'default',
              borderColor: isDragActive ? 'var(--text-secondary)' : 'var(--border-primary)',
              background: isDragActive ? 'var(--bg-hover)' : 'var(--bg-card)',
              opacity: uploadEnabled ? 1 : 0.55,
            }}
          >
            <input {...getInputProps()} data-testid="expense-upload-input" disabled={!uploadEnabled} />
            <Upload size={20} className="text-content-muted" style={{ margin: '0 auto 6px', display: 'block' }} />
            <div className="text-content-muted" style={{ fontSize: 'calc(12.5px * var(--fs-scale-body, 1))', fontWeight: 550 }}>
              {t('files.dropzone')}
            </div>
            <div className="text-content-faint" style={{ fontSize: 'calc(11px * var(--fs-scale-caption, 1))', marginTop: 3 }}>
              {t('files.dropzoneHint')}
            </div>
          </div>

          {stagedUploads.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 8 }}>
              {stagedUploads.map((staged, index) => {
                const Icon = getFileIcon(staged.file.type)
                const metadata = [formatSize(staged.file.size), staged.file.type].filter(Boolean).join(' · ')
                const failure = attachmentFailures.find(current =>
                  current.stagedUploadId === staged.id ||
                  (current.fileId !== undefined && current.fileId === staged.uploadedFile?.id),
                )
                const retrying = failure?.key === retryingAttachmentKey
                return (
                  <div key={staged.id} className="bg-surface-card border border-edge" data-testid="expense-staged-upload" style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '8px 10px', borderRadius: 10 }}>
                    <Icon size={16} className="text-content-muted" style={{ flexShrink: 0 }} />
                    <span style={{ minWidth: 0, flex: 1, display: 'flex', flexDirection: 'column', gap: 2 }}>
                      <span className="text-content" style={{ fontSize: 'calc(12.5px * var(--fs-scale-body, 1))', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {staged.file.name}
                      </span>
                      {metadata && <span className="text-content-faint" style={{ fontSize: 'calc(10.5px * var(--fs-scale-caption, 1))' }}>{metadata}</span>}
                      {failure && <span data-testid="expense-attachment-failure" className="text-content-muted" style={{ fontSize: 'calc(10.5px * var(--fs-scale-caption, 1))' }}>{t('costs.attachmentFailed')}: {failure.fileName}</span>}
                    </span>
                    {failure && onRetryAttachment && (
                      <button
                        type="button"
                        aria-label={retryLabel(failure)}
                        onClick={() => retry(failure)}
                        disabled={disabled || retrying}
                        className="text-content"
                        style={{ border: 0, background: 'none', padding: '3px 0', fontFamily: 'inherit', fontSize: 'calc(11px * var(--fs-scale-body, 1))', fontWeight: 650, cursor: disabled || retrying ? 'default' : 'pointer', flexShrink: 0 }}
                      >
                        {t('costs.retryAttachment')}
                      </button>
                    )}
                    {staged.uploadedFile && !failure && <span className="text-content-faint" style={{ fontSize: 'calc(10.5px * var(--fs-scale-caption, 1))' }}>✓</span>}
                    <button
                      type="button"
                      aria-label={`${t('files.unlink')} ${staged.file.name}`}
                      onClick={() => onRemoveUpload(index)}
                      disabled={!uploadEnabled || Boolean(staged.uploadedFile && failure)}
                      className="text-content-muted"
                      style={{ display: 'grid', placeItems: 'center', padding: 3, border: 0, background: 'none', cursor: uploadEnabled && !(staged.uploadedFile && failure) ? 'pointer' : 'default', flexShrink: 0 }}
                    >
                      <X size={15} />
                    </button>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      ) : (
        <div role="tabpanel" aria-label={t('costs.filesForExpense')}>
          {liveFiles.length === 0 ? (
            <div className="text-content-faint" style={{ fontSize: 'calc(12px * var(--fs-scale-body, 1))', padding: '8px 0 2px' }}>
              {t('costs.noFilesForExpense')}
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {liveFiles.map(file => {
                const Icon = getFileIcon(file.mime_type)
                const metadata = [formatSize(file.file_size), file.mime_type].filter(Boolean).join(' · ')
                const failure = attachmentFailures.find(current => current.fileId === file.id)
                const retrying = failure?.key === retryingAttachmentKey
                const inputId = `expense-file-${file.id}`
                return (
                  <div key={file.id} data-testid={`expense-file-row-${file.id}`} className="bg-surface-card border border-edge" style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '8px 10px', borderRadius: 10, opacity: canAttachFiles ? 1 : 0.65 }}>
                    <input
                      id={inputId}
                      type="checkbox"
                      checked={selectedFileIds.has(file.id)}
                      onChange={() => onToggleFile(file.id)}
                      disabled={!attachEnabled}
                      aria-label={file.original_name}
                      style={{ accentColor: 'var(--text-primary)', flexShrink: 0 }}
                    />
                    <button
                      type="button"
                      onClick={() => openFile(file)}
                      aria-label={`${file.original_name} preview`}
                      title={t('common.open')}
                      style={{ width: 42, height: 42, flexShrink: 0, display: 'grid', placeItems: 'center', overflow: 'hidden', borderRadius: 9, border: 0, padding: 0, background: 'var(--bg-tertiary)', color: 'var(--text-muted)', cursor: 'pointer' }}
                    >
                      {isImage(file.mime_type)
                        ? <AuthedImg
                            src={file.url}
                            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                            fallback={<Icon data-testid="expense-file-type-icon" size={20} strokeWidth={1.8} />}
                          />
                        : <Icon size={20} strokeWidth={1.8} />}
                    </button>
                    <label htmlFor={inputId} style={{ minWidth: 0, flex: 1, display: 'flex', cursor: attachEnabled ? 'pointer' : 'default' }}>
                      <span style={{ minWidth: 0, display: 'flex', flexDirection: 'column', gap: 2 }}>
                          <span className="text-content" style={{ fontSize: 'calc(12.5px * var(--fs-scale-body, 1))', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {file.original_name}
                          </span>
                          {metadata && <span className="text-content-faint" style={{ fontSize: 'calc(10.5px * var(--fs-scale-caption, 1))' }}>{metadata}</span>}
                          {file.description && <span className="text-content-muted" style={{ fontSize: 'calc(10.5px * var(--fs-scale-caption, 1))', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{file.description}</span>}
                          {failure && <span data-testid="expense-attachment-failure" className="text-content-muted" style={{ fontSize: 'calc(10.5px * var(--fs-scale-caption, 1))' }}>{t('costs.attachmentFailed')}: {failure.fileName}</span>}
                      </span>
                    </label>
                    {failure && onRetryAttachment && (
                      <button
                        type="button"
                        aria-label={retryLabel(failure)}
                        onClick={(event) => { event.preventDefault(); event.stopPropagation(); retry(failure) }}
                        disabled={disabled || retrying}
                        className="text-content"
                        style={{ border: 0, background: 'none', padding: '3px 0', fontFamily: 'inherit', fontSize: 'calc(11px * var(--fs-scale-body, 1))', fontWeight: 650, cursor: disabled || retrying ? 'default' : 'pointer', flexShrink: 0 }}
                      >
                        {t('costs.retryAttachment')}
                      </button>
                    )}
                    <button
                      type="button"
                      data-testid="expense-file-preview"
                      onClick={() => openFile(file)}
                      aria-label={`${t('common.open')} ${file.original_name}`}
                      title={t('common.open')}
                      className="text-content-muted hover:text-content"
                      style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 6, border: 0, background: 'none', cursor: 'pointer', flexShrink: 0 }}
                    >
                      <Eye size={15} />
                    </button>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}
      </section>
      {lightboxIndex !== null && (
        <ImageLightbox files={mediaFiles} initialIndex={lightboxIndex} onClose={() => setLightboxIndex(null)} />
      )}
      {previewFile && (isMarkdown(previewFile.mime_type, previewFile.original_name)
        ? <MarkdownPreviewModal {...previewState} />
        : <PdfPreviewModal {...previewState} />)}
    </>
  )
}
