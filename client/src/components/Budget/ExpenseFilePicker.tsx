import { useState } from 'react'
import { useDropzone } from 'react-dropzone'
import { Paperclip, Upload, X } from 'lucide-react'
import { useTranslation } from '../../i18n'
import type { TripFile } from '../../types'
import { formatSize, getFileIcon } from '../Files/FileManager.helpers'
import type { ExpenseStagedUpload } from './expenseAttachmentStaging'

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
}

type PickerTab = 'upload' | 'trip-files'

/** Existing trip-file selection and new-upload staging for an expense. */
export default function ExpenseFilePicker({
  files,
  selectedFileIds,
  onToggleFile,
  stagedUploads,
  onAddUploads,
  onRemoveUpload,
  canAttachFiles = true,
  canUploadFiles = false,
}: ExpenseFilePickerProps) {
  const { t } = useTranslation()
  const [activeTab, setActiveTab] = useState<PickerTab>('trip-files')
  const liveFiles = files.filter(file => !file.deleted_at)
  const uploadEnabled = canAttachFiles && canUploadFiles
  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop: onAddUploads,
    multiple: true,
    disabled: !uploadEnabled,
  })

  return (
    <section className="rounded-2xl border border-edge bg-surface-secondary p-4" aria-labelledby="expense-files-title">
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 9, marginBottom: 10 }}>
        <Paperclip size={16} className="text-content-muted" style={{ marginTop: 2, flexShrink: 0 }} />
        <div>
          <div id="expense-files-title" className="text-content" style={{ fontSize: 'calc(13px * var(--fs-scale-body, 1))', fontWeight: 650 }}>
            {t('costs.tripFiles')}
          </div>
          <div className="text-content-faint" style={{ fontSize: 'calc(11.5px * var(--fs-scale-caption, 1))', lineHeight: 1.45, marginTop: 3 }}>
            {t('costs.tripFilesHint')}
          </div>
        </div>
      </div>

      <div role="tablist" style={{ display: 'flex', gap: 4, marginBottom: 10, borderBottom: '1px solid var(--border-primary)' }}>
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'upload'}
          onClick={() => setActiveTab('upload')}
          className={activeTab === 'upload' ? 'text-content border-b-2' : 'text-content-muted'}
          style={{ padding: '6px 10px 8px', border: 0, borderBottomColor: activeTab === 'upload' ? 'var(--text-primary)' : 'transparent', background: 'none', cursor: 'pointer', fontFamily: 'inherit', fontSize: 'calc(12px * var(--fs-scale-body, 1))', fontWeight: 650 }}
        >
          <Upload size={13} style={{ verticalAlign: '-2px', marginRight: 5 }} />
          {t('costs.uploadFiles')}
          {stagedUploads.length > 0 && ` (${stagedUploads.length})`}
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'trip-files'}
          onClick={() => setActiveTab('trip-files')}
          className={activeTab === 'trip-files' ? 'text-content border-b-2' : 'text-content-muted'}
          style={{ padding: '6px 10px 8px', border: 0, borderBottomColor: activeTab === 'trip-files' ? 'var(--text-primary)' : 'transparent', background: 'none', cursor: 'pointer', fontFamily: 'inherit', fontSize: 'calc(12px * var(--fs-scale-body, 1))', fontWeight: 650 }}
        >
          {t('costs.tripFiles')}
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
                return (
                  <div key={`${staged.file.name}-${staged.file.lastModified}-${index}`} className="bg-surface-card border border-edge" data-testid="expense-staged-upload" style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '8px 10px', borderRadius: 10 }}>
                    <Icon size={16} className="text-content-muted" style={{ flexShrink: 0 }} />
                    <span style={{ minWidth: 0, flex: 1, display: 'flex', flexDirection: 'column', gap: 2 }}>
                      <span className="text-content" style={{ fontSize: 'calc(12.5px * var(--fs-scale-body, 1))', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {staged.file.name}
                      </span>
                      {metadata && <span className="text-content-faint" style={{ fontSize: 'calc(10.5px * var(--fs-scale-caption, 1))' }}>{metadata}</span>}
                    </span>
                    {staged.uploadedFile && <span className="text-content-faint" style={{ fontSize: 'calc(10.5px * var(--fs-scale-caption, 1))' }}>✓</span>}
                    <button
                      type="button"
                      aria-label={`${t('files.unlink')} ${staged.file.name}`}
                      onClick={() => onRemoveUpload(index)}
                      disabled={!uploadEnabled}
                      className="text-content-muted"
                      style={{ display: 'grid', placeItems: 'center', padding: 3, border: 0, background: 'none', cursor: uploadEnabled ? 'pointer' : 'default', flexShrink: 0 }}
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
        <div role="tabpanel" aria-label={t('costs.tripFiles')}>
          {liveFiles.length === 0 ? (
            <div className="text-content-faint" style={{ fontSize: 'calc(12px * var(--fs-scale-body, 1))', padding: '8px 0 2px' }}>
              {t('costs.noTripFiles')}
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {liveFiles.map(file => {
                const Icon = getFileIcon(file.mime_type)
                const metadata = [formatSize(file.file_size), file.mime_type].filter(Boolean).join(' · ')
                return (
                  <label key={file.id} className="bg-surface-card border border-edge" style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '8px 10px', borderRadius: 10, cursor: canAttachFiles ? 'pointer' : 'default', opacity: canAttachFiles ? 1 : 0.65 }}>
                    <input
                      type="checkbox"
                      checked={selectedFileIds.has(file.id)}
                      onChange={() => onToggleFile(file.id)}
                      disabled={!canAttachFiles}
                      aria-label={file.original_name}
                      style={{ accentColor: 'var(--text-primary)', flexShrink: 0 }}
                    />
                    <Icon size={16} className="text-content-muted" style={{ flexShrink: 0 }} />
                    <span style={{ minWidth: 0, display: 'flex', flexDirection: 'column', gap: 2 }}>
                      <span className="text-content" style={{ fontSize: 'calc(12.5px * var(--fs-scale-body, 1))', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {file.original_name}
                      </span>
                      {metadata && <span className="text-content-faint" style={{ fontSize: 'calc(10.5px * var(--fs-scale-caption, 1))' }}>{metadata}</span>}
                      {file.description && <span className="text-content-muted" style={{ fontSize: 'calc(10.5px * var(--fs-scale-caption, 1))', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{file.description}</span>}
                    </span>
                  </label>
                )
              })}
            </div>
          )}
        </div>
      )}
    </section>
  )
}
