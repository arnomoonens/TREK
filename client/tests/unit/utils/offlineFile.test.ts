import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { getCachedBlob } from '../../../src/db/offlineDb'
import {
  getCachedFileObjectUrl,
  isOfflineFileUnavailableError,
  OfflineFileUnavailableError,
} from '../../../src/utils/offlineFile'

vi.mock('../../../src/db/offlineDb', () => ({ getCachedBlob: vi.fn() }))

beforeEach(() => {
  vi.mocked(getCachedBlob).mockReset()
  vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:cached-file')
  vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {})
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('getCachedFileObjectUrl', () => {
  it('returns a disposable object URL for cached bytes', async () => {
    const blob = new Blob(['cached bytes'], { type: 'application/pdf' })
    vi.mocked(getCachedBlob).mockResolvedValue(blob)

    await expect(getCachedFileObjectUrl('/files/receipt.pdf')).resolves.toBe('blob:cached-file')
    expect(getCachedBlob).toHaveBeenCalledWith('/files/receipt.pdf')
    expect(URL.createObjectURL).toHaveBeenCalledWith(blob)
  })

  it('reports an uncached file as a connectivity-required error', async () => {
    vi.mocked(getCachedBlob).mockResolvedValue(null)

    const error = await getCachedFileObjectUrl('/files/missing.pdf').catch(reason => reason)
    expect(error).toBeInstanceOf(OfflineFileUnavailableError)
    expect(isOfflineFileUnavailableError(error)).toBe(true)
    expect((error as Error).message).toBe('File not available offline')
    expect(URL.createObjectURL).not.toHaveBeenCalled()
  })
})
