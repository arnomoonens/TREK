import { useEffect, useMemo, useState } from 'react'
import { Download, ExternalLink, Paperclip, X } from 'lucide-react'
import { useTranslation } from '../../i18n'
import { useToast } from '../shared/Toast'
import Modal from '../shared/Modal'
import MSheet from '../../mobile/components/MSheet'
import type { TripFile } from '../../types'
import { getAuthUrl } from '../../api/authUrl'
import { openFile as openFileInTab } from '../../utils/fileDownload'
import { getCachedFileObjectUrl } from '../../utils/offlineFile'
import { useNetworkMode } from '../../hooks/useNetworkMode'
import {
  formatSize,
  getFileIcon,
  isImage,
  isMarkdown,
  isMedia,
  isWalletPass,
  triggerDownload,
  fileErrorMessage,
} from '../Files/FileManager.helpers'
import { AuthedImg } from '../Files/FileManagerAuthedImg'
import { ImageLightbox } from '../Files/FileManagerImageLightbox'
import { MarkdownPreviewModal } from '../Files/FileManagerMarkdownPreviewModal'
import { PdfPreviewModal } from '../Files/FileManagerPdfPreviewModal'
import type { FilePreviewState } from '../Files/useFileManager'
import { filesForExpense } from './expenseAttachmentUtils'

export interface ExpenseAttachmentViewerProps {
  expenseId: number
  expenseName: string
  files: TripFile[]
  attachmentsUnavailable?: boolean
}

interface ExpenseAttachmentContainerProps extends ExpenseAttachmentViewerProps {
  onClose: () => void
}

/** Compact read-only count used by both Costs presentations. */
export function ExpenseAttachmentCount({ count, onClick, unavailable = false }: { count: number; onClick: () => void; unavailable?: boolean }) {
  const { t } = useTranslation()
  const label = unavailable
    ? t('costs.attachmentsUnavailable')
    : t(count === 1 ? 'costs.attachmentCount' : 'costs.attachmentsCount', { count })

  return (
    <button
      type="button"
      data-testid="expense-attachment-count"
      aria-label={label}
      title={label}
      onClick={onClick}
      disabled={unavailable}
      className="text-content-muted hover:text-content"
      style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '3px 7px', borderRadius: 999, border: '1px solid var(--border-primary)', background: 'var(--bg-secondary)', cursor: unavailable ? 'default' : 'pointer', opacity: unavailable ? 0.65 : 1, fontFamily: 'inherit', fontSize: 'calc(11px * var(--fs-scale-caption, 1))', fontWeight: 650, lineHeight: 1 }}
    >
      <Paperclip size={12} strokeWidth={2.2} />
      <span>{unavailable ? '—' : count}</span>
    </button>
  )
}

/** Desktop dialog for inspecting an Expense's live Files. */
export function ExpenseAttachmentsDialog({ isOpen, onClose, ...props }: ExpenseAttachmentContainerProps & { isOpen: boolean }) {
  const { t } = useTranslation()
  return (
    <Modal isOpen={isOpen} onClose={onClose} title={t('costs.attachmentsTitle', { name: props.expenseName })} size="lg">
      <ExpenseAttachmentList {...props} />
    </Modal>
  )
}

/** Mobile bottom sheet for inspecting an Expense's live Files. */
export function ExpenseAttachmentsSheet({ open, onClose, ...props }: ExpenseAttachmentContainerProps & { open: boolean }) {
  const { t } = useTranslation()
  const title = t('costs.attachmentsTitle', { name: props.expenseName })

  return (
    <MSheet open={open} onClose={onClose} variant="bottom" material="opaque" ariaLabel={title}>
      <div className="flex flex-none items-center justify-between border-b border-[color:var(--m-rowbr)] px-[18px] py-4">
        <div className="flex min-w-0 items-center gap-2">
          <Paperclip size={17} strokeWidth={2} className="flex-none text-m-muted" />
          <h2 className="truncate text-[0.9375rem] font-bold text-m-ink">{title}</h2>
        </div>
        <button type="button" onClick={onClose} aria-label={t('common.close')} className="flex h-8 w-8 flex-none items-center justify-center rounded-full text-m-muted">
          <X size={18} strokeWidth={2} />
        </button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-[18px] pb-[18px] pt-3">
        <ExpenseAttachmentList {...props} />
      </div>
    </MSheet>
  )
}

/** Shared read-only attachment rows and preview delegation. */
export function ExpenseAttachmentList({ expenseId, files, attachmentsUnavailable = false }: ExpenseAttachmentViewerProps) {
  const { t } = useTranslation()
  const toast = useToast()
  const { offline } = useNetworkMode()
  const [previewFile, setPreviewFile] = useState<TripFile | null>(null)
  const [previewFileUrl, setPreviewFileUrl] = useState('')
  const [previewError, setPreviewError] = useState(false)
  const [previewUnavailable, setPreviewUnavailable] = useState(false)
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null)
  const previewUrl = previewFile?.url
  const attachments = useMemo(() => filesForExpense(files, expenseId), [files, expenseId])
  const mediaFiles = useMemo(() => attachments.filter(file => isMedia(file.mime_type)), [attachments])

  useEffect(() => {
    let objectUrl = ''
    if (!previewUrl) {
      setPreviewFileUrl('')
      setPreviewUnavailable(false)
      return
    }
    let current = true
    setPreviewFileUrl('')
    setPreviewError(false)
    setPreviewUnavailable(false)
    const resolve = offline
      ? getCachedFileObjectUrl(previewUrl)
      : getAuthUrl(previewUrl, 'download')
    resolve
      .then(url => {
        if (current) {
          objectUrl = offline ? url : ''
          setPreviewFileUrl(url)
        } else if (offline) {
          URL.revokeObjectURL(url)
        }
      })
      .catch(() => {
        if (current) {
          if (offline) setPreviewUnavailable(true)
          else {
            setPreviewError(true)
            toast.error(t('files.openError'))
          }
        }
      })
    return () => {
      current = false
      if (objectUrl) URL.revokeObjectURL(objectUrl)
    }
  }, [previewUrl, t, toast, offline])

  const openAttachment = (file: TripFile) => {
    if (isMedia(file.mime_type)) {
      const index = mediaFiles.findIndex(candidate => candidate.id === file.id)
      setLightboxIndex(index >= 0 ? index : 0)
      return
    }
    if (isWalletPass(file.mime_type, file.original_name)) {
      openFileInTab(file.url, file.original_name).catch(error => toast.error(fileErrorMessage(t, error)))
      return
    }
    setPreviewFile(file)
  }

  const previewState: FilePreviewState = { previewFile, setPreviewFile, previewFileUrl: previewError ? '' : previewFileUrl, previewUnavailable, toast, t }

  return (
    <>
      <div data-testid="expense-attachment-list" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {attachmentsUnavailable ? (
          <p role="alert" className="text-content-muted" style={{ margin: 0, padding: '18px 4px', textAlign: 'center', fontSize: 'calc(13px * var(--fs-scale-body, 1))' }}>
            {t('costs.attachmentsUnavailable')}
          </p>
        ) : attachments.length === 0 ? (
          <p className="text-content-faint" style={{ margin: 0, padding: '18px 4px', textAlign: 'center', fontSize: 'calc(13px * var(--fs-scale-body, 1))' }}>
            {t('costs.noAttachments')}
          </p>
        ) : (
          attachments.map(file => (
            <ExpenseAttachmentRow key={file.id} file={file} onOpen={() => openAttachment(file)} toast={toast} t={t} />
          ))
        )}
      </div>

      {lightboxIndex !== null && (
        <ImageLightbox files={mediaFiles} initialIndex={lightboxIndex} onClose={() => setLightboxIndex(null)} />
      )}
      {previewFile && (isMarkdown(previewFile.mime_type, previewFile.original_name)
        ? <MarkdownPreviewModal {...previewState} />
        : <PdfPreviewModal {...previewState} />)}
    </>
  )
}

function ExpenseAttachmentRow({ file, onOpen, toast, t }: { file: TripFile; onOpen: () => void; toast: ReturnType<typeof useToast>; t: ReturnType<typeof useTranslation>['t'] }) {
  const FileIcon = getFileIcon(file.mime_type)

  return (
    <div
      data-testid="expense-attachment-row"
      className="bg-surface-card border border-edge"
      style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0, padding: '9px 10px', borderRadius: 12 }}
    >
      <button
        type="button"
        onClick={onOpen}
        aria-label={file.original_name}
        style={{ width: 42, height: 42, flexShrink: 0, display: 'grid', placeItems: 'center', overflow: 'hidden', borderRadius: 9, border: 0, padding: 0, background: 'var(--bg-tertiary)', color: 'var(--text-muted)', cursor: 'pointer' }}
      >
        {isImage(file.mime_type)
          ? <AuthedImg
              src={file.url}
              style={{ width: '100%', height: '100%', objectFit: 'cover' }}
              fallback={<FileIcon data-testid="expense-attachment-type-icon" size={20} strokeWidth={1.8} />}
            />
          : <FileIcon size={20} strokeWidth={1.8} />}
      </button>

      <div style={{ flex: 1, minWidth: 0 }}>
        <button
          type="button"
          data-testid="expense-attachment-name"
          onClick={onOpen}
          className="text-content hover:underline"
          style={{ display: 'block', maxWidth: '100%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', border: 0, padding: 0, background: 'none', cursor: 'pointer', fontFamily: 'inherit', fontSize: 'calc(13px * var(--fs-scale-body, 1))', fontWeight: 650, textAlign: 'left' }}
        >
          {file.original_name}
        </button>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginTop: 3, minWidth: 0 }}>
          {file.file_size ? <span className="text-content-faint" style={{ fontSize: 'calc(11px * var(--fs-scale-caption, 1))' }}>{formatSize(file.file_size)}</span> : null}
          {file.description ? <span className="text-content-muted" style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 'calc(11px * var(--fs-scale-caption, 1))' }}>{file.description}</span> : null}
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 2, flexShrink: 0 }}>
        <button type="button" onClick={onOpen} aria-label={t('common.open')} title={t('common.open')} className="text-content-muted hover:text-content" style={{ display: 'flex', padding: 6, border: 0, background: 'none', cursor: 'pointer' }}>
          <ExternalLink size={15} />
        </button>
        <button type="button" onClick={() => triggerDownload(file.url, file.original_name, error => toast.error(fileErrorMessage(t, error)))} aria-label={t('files.download')} title={t('files.download')} className="text-content-muted hover:text-content" style={{ display: 'flex', padding: 6, border: 0, background: 'none', cursor: 'pointer' }}>
          <Download size={15} />
        </button>
      </div>
    </div>
  )
}
