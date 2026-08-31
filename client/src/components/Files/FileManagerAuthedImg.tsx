import { useState, useEffect, type ReactNode } from 'react'
import { getAuthUrl } from '../../api/authUrl'
import { useNetworkMode } from '../../hooks/useNetworkMode'
import { getCachedFileObjectUrl } from '../../utils/offlineFile'

// Authenticated image — fetches a short-lived download token and renders the image
export function AuthedImg({ src, style, fallback }: { src: string; style?: React.CSSProperties; fallback?: ReactNode }) {
  const [authSrc, setAuthSrc] = useState('')
  const [failed, setFailed] = useState(false)
  const { offline } = useNetworkMode()

  useEffect(() => {
    let current = true
    let objectUrl = ''
    setAuthSrc('')
    setFailed(false)
    const resolve = offline
      ? getCachedFileObjectUrl(src)
      : getAuthUrl(src, 'download')
    resolve.then(url => {
      if (current) {
        objectUrl = offline ? url : ''
        setAuthSrc(url)
      } else if (offline) {
        URL.revokeObjectURL(url)
      }
    }).catch(() => { if (current) setFailed(true) })
    return () => {
      current = false
      if (objectUrl) URL.revokeObjectURL(objectUrl)
    }
  }, [src, offline])

  if (failed || !authSrc) return fallback ?? null
  return <img src={authSrc} alt="" style={style} onError={() => setFailed(true)} />
}
