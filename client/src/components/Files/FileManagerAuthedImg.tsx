import { useState, useEffect, type ReactNode } from 'react'
import { getAuthUrl } from '../../api/authUrl'
import { useNetworkMode } from '../../hooks/useNetworkMode'

// Authenticated image — fetches a short-lived download token and renders the image
export function AuthedImg({ src, style, fallback }: { src: string; style?: React.CSSProperties; fallback?: ReactNode }) {
  const [authSrc, setAuthSrc] = useState('')
  const [failed, setFailed] = useState(false)
  const { offline } = useNetworkMode()

  useEffect(() => {
    let current = true
    setAuthSrc('')
    setFailed(false)
    if (offline) {
      setFailed(true)
      return () => { current = false }
    }
    getAuthUrl(src, 'download')
      .then(url => { if (current) setAuthSrc(url) })
      .catch(() => { if (current) setFailed(true) })
    return () => {
      current = false
    }
  }, [src, offline])

  if (failed || !authSrc) return fallback ?? null
  return <img src={authSrc} alt="" style={style} onError={() => setFailed(true)} />
}
