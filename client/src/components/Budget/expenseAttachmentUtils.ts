import type { TripFile } from '../../types'

export function attachmentCreatedAt(file: TripFile, expenseId?: number): string {
  if (expenseId != null) return file.expense_attachment_created_at?.[String(expenseId)] || file.created_at
  return file.created_at
}

export function filesForExpense(files: TripFile[], expenseId: number): TripFile[] {
  return files
    .filter(file => !file.deleted_at && file.linked_expense_ids?.includes(expenseId))
    .sort((a, b) => attachmentCreatedAt(a, expenseId).localeCompare(attachmentCreatedAt(b, expenseId)) || a.id - b.id)
}
