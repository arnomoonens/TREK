import { useState, useEffect, type ReactNode } from 'react'
import { getAuthUrl } from '../../api/authUrl'

// Authenticated image — fetches a short-lived download token and renders the image
export function AuthedImg({ src, style, fallback }: { src: string; style?: React.CSSProperties; fallback?: ReactNode }) {
  const [authSrc, setAuthSrc] = useState('')
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    let current = true
    setAuthSrc('')
    setFailed(false)
    getAuthUrl(src, 'download')
      .then(url => { if (current) setAuthSrc(url) })
      .catch(() => { if (current) setFailed(true) })
    return () => {
      current = false
    }
  }, [src])

  if (failed || !authSrc) return fallback ?? null
  return <img src={authSrc} alt="" style={style} onError={() => setFailed(true)} />
}
