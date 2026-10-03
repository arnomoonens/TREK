import { beforeEach, describe, expect, it, vi } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { useFilePreviewUrl } from './useFilePreviewUrl'

const mocks = vi.hoisted(() => ({
  offline: false,
  auth: vi.fn(),
  blob: vi.fn(),
}))
vi.mock('../../api/authUrl', () => ({ getAuthUrl: mocks.auth }))
vi.mock('../../utils/fileDownload', () => ({ getFileBlob: mocks.blob }))
vi.mock('../../sync/networkMode', () => ({ isEffectivelyOffline: () => mocks.offline }))

beforeEach(() => {
  vi.clearAllMocks()
  mocks.offline = false
  mocks.auth.mockResolvedValue('/receipt.pdf?token=test')
})

describe('file preview bytes', () => {
  it('uses the existing authenticated preview online', async () => {
    const { result } = renderHook(() => useFilePreviewUrl('/receipt.pdf'))
    await waitFor(() => expect(result.current.url).toBe('/receipt.pdf?token=test'))
    expect(mocks.blob).not.toHaveBeenCalled()
  })

  it('opens downloaded bytes offline and releases the object URL on close', async () => {
    mocks.offline = true
    mocks.blob.mockResolvedValue(new Blob(['receipt'], { type: 'application/pdf' }))
    const create = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:cached-receipt')
    const revoke = vi.spyOn(URL, 'revokeObjectURL')
    const { result, unmount } = renderHook(() => useFilePreviewUrl('/receipt.pdf'))
    await waitFor(() => expect(result.current.url).toBe('blob:cached-receipt'))
    expect(mocks.blob).toHaveBeenCalledWith('/receipt.pdf')
    expect(mocks.auth).not.toHaveBeenCalled()
    unmount()
    expect(revoke).toHaveBeenCalledWith('blob:cached-receipt')
    create.mockRestore()
    revoke.mockRestore()
  })

  it('exposes an explicit failure when bytes were not downloaded', async () => {
    mocks.offline = true
    const error = new Error('File not available offline')
    mocks.blob.mockRejectedValue(error)
    const { result } = renderHook(() => useFilePreviewUrl('/receipt.pdf'))
    await waitFor(() => expect(result.current.error).toBe(error))
    expect(result.current.url).toBe('')
  })
})
