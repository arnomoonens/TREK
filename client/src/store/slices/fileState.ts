import type { TripFile } from '../../types'

/**
 * Relationship metadata is part of the File snapshot, not a client-side
 * append-only log. Normalize it at the store boundary so duplicate or delayed
 * realtime frames cannot manufacture duplicate attachment relationships.
 */
export function normalizeTripFile(file: TripFile): TripFile {
  if (!file.linked_budget_item_ids) return file

  const linkedExpenseIds = [...new Set(file.linked_budget_item_ids)]
  const timestamps = file.expense_attachment_created_at
  if (!timestamps) return { ...file, linked_budget_item_ids: linkedExpenseIds }

  const linkedIds = new Set(linkedExpenseIds.map(String))
  return {
    ...file,
    linked_budget_item_ids: linkedExpenseIds,
    expense_attachment_created_at: Object.fromEntries(
      Object.entries(timestamps).filter(([expenseId]) => linkedIds.has(expenseId)),
    ),
  }
}

/** Add a File snapshot without replacing an already-present authoritative row. */
export function addTripFile(files: TripFile[], incoming: TripFile): TripFile[] {
  const { file, index } = locateTripFile(files, incoming)
  if (index === -1) return [file, ...files]

  const normalizedExisting = normalizeTripFile(files[index])
  if (normalizedExisting === files[index]) return files

  const next = files.slice()
  next[index] = normalizedExisting
  return next
}

/** Remove one Expense relationship while retaining the File itself. */
export function removeExpenseLink(file: TripFile, expenseId: number): TripFile {
  if (!file.linked_budget_item_ids?.includes(expenseId)) return file

  const attachmentCreatedAt = { ...(file.expense_attachment_created_at || {}) }
  delete attachmentCreatedAt[String(expenseId)]
  return normalizeTripFile({
    ...file,
    linked_budget_item_ids: file.linked_budget_item_ids.filter(id => id !== expenseId),
    expense_attachment_created_at: attachmentCreatedAt,
  })
}

/** Replace one complete authoritative File snapshot, keyed by its id. */
export function upsertTripFile(files: TripFile[], incoming: TripFile): TripFile[] {
  const { file, index } = locateTripFile(files, incoming)
  if (index === -1) return [file, ...files]

  const next = files.slice()
  next[index] = file
  return next
}

function locateTripFile(files: TripFile[], incoming: TripFile): { file: TripFile; index: number } {
  const file = normalizeTripFile(incoming)
  return { file, index: files.findIndex(candidate => candidate.id === file.id) }
}

/** Remove a File by id. Repeated delete frames are deliberately no-ops. */
export function removeTripFile(files: TripFile[], fileId: number | string): TripFile[] {
  const id = Number(fileId)
  return files.filter(file => file.id !== id)
}
