import { act, renderHook } from '@testing-library/react'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useTripStore } from '../../store/tripStore'
import { TranslationProvider } from '../../i18n/TranslationContext'
import { buildTripFile } from '../../../tests/helpers/factories'
import { resetAllStores } from '../../../tests/helpers/store'
import { useExpenseAttachments } from './useExpenseAttachments'

const toastError = vi.hoisted(() => vi.fn())
vi.mock('../shared/Toast', () => ({
  useToast: () => ({ error: toastError }),
}))

function wrapper({ children }: { children: ReactNode }) {
  return <TranslationProvider>{children}</TranslationProvider>
}

describe('useExpenseAttachments', () => {
  beforeEach(() => {
    resetAllStores()
    toastError.mockClear()
  })

  it('keeps the current file selection and reports a failed refresh after attachment failure', async () => {
    const linkedFile = buildTripFile({ id: 91, linked_budget_item_ids: [5] })
    const availableFile = buildTripFile({ id: 92, linked_budget_item_ids: [] })
    const files = [linkedFile, availableFile]
    useTripStore.setState({ files })
    const loadFiles = vi.fn(async () => false)
    const attachExpenseFile = vi.fn(async () => { throw new Error('attach failed') })

    const { result } = renderHook(() => useExpenseAttachments({
      tripId: 1,
      editingExpenseId: 5,
      files,
      canAttachFiles: true,
      canUploadFiles: false,
      addFile: vi.fn(),
      attachExpenseFile,
      detachExpenseFile: vi.fn(),
      loadFiles,
    }), { wrapper })

    act(() => result.current.toggleFile(availableFile.id))
    let saved = true
    await act(async () => {
      saved = await result.current.saveAttachments(5)
    })

    expect(saved).toBe(false)
    expect(attachExpenseFile).toHaveBeenCalledWith(1, 5, availableFile.id)
    expect(loadFiles).toHaveBeenCalledWith(1)
    expect(result.current.selectedFileIds).toEqual(new Set([linkedFile.id, availableFile.id]))
    expect(useTripStore.getState().files).toEqual(files)
    expect(toastError).toHaveBeenCalledWith(
      'The expense was saved, but some file attachments could not be updated.',
    )
  })
})
