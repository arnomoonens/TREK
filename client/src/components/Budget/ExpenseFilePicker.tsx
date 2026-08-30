import { Paperclip } from 'lucide-react'
import { useTranslation } from '../../i18n'
import type { TripFile } from '../../types'
import { formatSize, getFileIcon } from '../Files/FileManager.helpers'

interface ExpenseFilePickerProps {
  files: TripFile[]
  selectedFileIds: Set<number>
  onToggleFile: (fileId: number) => void
  disabled?: boolean
}

/** Existing trip-file selection for an expense. File metadata stays read-only. */
export default function ExpenseFilePicker({ files, selectedFileIds, onToggleFile, disabled = false }: ExpenseFilePickerProps) {
  const { t } = useTranslation()
  const liveFiles = files.filter(file => !file.deleted_at)

  return (
    <section className="rounded-2xl border border-edge bg-surface-secondary p-4" aria-labelledby="expense-trip-files-title">
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 9, marginBottom: 10 }}>
        <Paperclip size={16} className="text-content-muted" style={{ marginTop: 2, flexShrink: 0 }} />
        <div>
          <div id="expense-trip-files-title" className="text-content" style={{ fontSize: 'calc(13px * var(--fs-scale-body, 1))', fontWeight: 650 }}>
            {t('costs.tripFiles')}
          </div>
          <div className="text-content-faint" style={{ fontSize: 'calc(11.5px * var(--fs-scale-caption, 1))', lineHeight: 1.45, marginTop: 3 }}>
            {t('costs.tripFilesHint')}
          </div>
        </div>
      </div>

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
              <label key={file.id} className="bg-surface-card border border-edge" style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '8px 10px', borderRadius: 10, cursor: disabled ? 'default' : 'pointer', opacity: disabled ? 0.65 : 1 }}>
                <input
                  type="checkbox"
                  checked={selectedFileIds.has(file.id)}
                  onChange={() => onToggleFile(file.id)}
                  disabled={disabled}
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
    </section>
  )
}
