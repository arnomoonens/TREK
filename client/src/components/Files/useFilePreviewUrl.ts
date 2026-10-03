import { useEffect, useState } from 'react'
import { getAuthUrl } from '../../api/authUrl'
import { getFileBlob } from '../../utils/fileDownload'
import { isEffectivelyOffline } from '../../sync/networkMode'

/** Preview online with a resource token, or use the trip's downloaded bytes offline. */
export function useFilePreviewUrl(source: string | undefined) {
  const [url, setUrl] = useState('')
  const [error, setError] = useState<unknown>(null)

  useEffect(() => {
    let current = true
    let blobUrl: string | undefined
    setUrl('')
    setError(null)
    if (source) {
      const resolve = isEffectivelyOffline()
        ? getFileBlob(source).then(blob => {
            blobUrl = URL.createObjectURL(blob)
            return blobUrl
          })
        : getAuthUrl(source, 'download')
      void resolve.then(value => {
        if (current) setUrl(value)
        else if (blobUrl) URL.revokeObjectURL(blobUrl)
      }, cause => {
        if (current) setError(cause)
      })
    }
    return () => {
      current = false
      if (blobUrl) URL.revokeObjectURL(blobUrl)
    }
  }, [source])

  return { url, error }
}
