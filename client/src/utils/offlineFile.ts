import { getCachedBlob } from '../db/offlineDb'

const OFFLINE_FILE_UNAVAILABLE_CODE = 'offline-file-unavailable'

export class OfflineFileUnavailableError extends Error {
  readonly code = OFFLINE_FILE_UNAVAILABLE_CODE

  constructor() {
    super('File not available offline')
    this.name = 'OfflineFileUnavailableError'
  }
}

export function isOfflineFileUnavailableError(error: unknown): boolean {
  const candidate = error as { code?: unknown; message?: unknown } | null
  return error instanceof OfflineFileUnavailableError
    || candidate?.code === OFFLINE_FILE_UNAVAILABLE_CODE
    || candidate?.message === 'File not available offline'
}

/** Return a disposable object URL for a file already present in the byte cache. */
export async function getCachedFileObjectUrl(url: string): Promise<string> {
  const blob = await getCachedBlob(url)
  if (!blob) throw new OfflineFileUnavailableError()
  return URL.createObjectURL(blob)
}
