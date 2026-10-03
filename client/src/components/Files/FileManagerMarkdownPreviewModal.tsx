import { useEffect, useId, useState } from 'react'
import { ExternalLink, Download, FileText } from 'lucide-react'
import Markdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import remarkBreaks from 'remark-breaks'
import rehypeSanitize from 'rehype-sanitize'
import { openFile as openFileUrl } from '../../utils/fileDownload'
import type { FilePreviewState } from './useFileManager'
import { fileErrorMessage, triggerDownload } from './FileManager.helpers'
import { DialogHeader, DialogShell, DialogTile, NEUTRAL_TINT, PILL } from '../shared/DialogShell'

/**
 * Inline preview for uploaded Markdown files (#1345). Fetches the file's text via
 * the signed preview URL and renders it with react-markdown. Output is sanitized
 * with rehype-sanitize — these are UNTRUSTED uploads, unlike collab notes — and
 * react-markdown v10 already drops raw HTML, so no script can execute.
 */
export function MarkdownPreviewModal(S: FilePreviewState) {
  const { previewFile, setPreviewFile, previewFileUrl, toast, t } = S
  const [text, setText] = useState('')
  const [err, setErr] = useState<string | null>(null)
  const labelId = useId()
  const close = () => setPreviewFile(null)

  useEffect(() => {
    if (!previewFileUrl) return
    let cancelled = false
    setErr(null)
    setText('')
    fetch(previewFileUrl, { credentials: 'include' })
      .then(r => (r.ok ? r.text() : Promise.reject(new Error('load failed'))))
      .then(body => { if (!cancelled) setText(body) })
      .catch(error => { if (!cancelled) setErr(fileErrorMessage(t, error)) })
    return () => { cancelled = true }
  }, [previewFileUrl, t])

  if (!previewFile) return null

  const openInTab = () => openFileUrl(previewFile.url, previewFile.original_name).catch(error => toast.error(fileErrorMessage(t, error)))

  return (
    <DialogShell
      onClose={close}
      labelledBy={labelId}
      width="editor"
      bodyClassName="collab-note-md min-h-0 flex-1 overflow-y-auto px-7 py-6 leading-relaxed text-content [word-break:break-word]"
      header={(
        <DialogHeader
          tile={<DialogTile><FileText size={20} strokeWidth={1.9} className="text-content-muted" /></DialogTile>}
          tint={NEUTRAL_TINT}
          labelId={labelId}
          onClose={close}
          title={previewFile.original_name}
          pills={(
            <>
              <button type="button" onClick={openInTab} className={`${PILL} hover:opacity-80`}>
                <ExternalLink size={13} strokeWidth={2.2} /> {t('files.openTab')}
              </button>
              <button type="button" onClick={() => triggerDownload(previewFile.url, previewFile.original_name, error => toast.error(fileErrorMessage(t, error)))} className={`${PILL} hover:opacity-80`}>
                <Download size={13} strokeWidth={2.2} /> {t('files.download') || 'Download'}
              </button>
            </>
          )}
        />
      )}
    >
      {err
        ? <p className="text-content-muted">{err}</p>
        : <Markdown remarkPlugins={[remarkGfm, remarkBreaks]} rehypePlugins={[rehypeSanitize]}>{text}</Markdown>}
    </DialogShell>
  )
}
