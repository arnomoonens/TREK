import type { BudgetItem, TripFile } from '../../types'

type ExpenseDeleteTranslator = (key: string, params?: Record<string, string | number>) => string

export function linkedExpenseIds(file: Pick<TripFile, 'linked_expense_ids'>): number[] {
  return [...new Set(file.linked_expense_ids || [])]
}

export function linkedExpenseCount(
  file: Pick<TripFile, 'linked_expense_ids'>,
  liveExpenses: ReadonlyArray<Pick<BudgetItem, 'id'>>,
): number {
  const ids = linkedExpenseIds(file)
  const liveIds = new Set(liveExpenses.map(expense => expense.id))
  return ids.filter(id => liveIds.has(id)).length
}

export function getExpenseDeleteWarning(
  files: TripFile[],
  expense: Pick<BudgetItem, 'id' | 'name'>,
  t: ExpenseDeleteTranslator,
): { count: number; message: string } {
  const count = filesForExpense(files, expense.id, { includeDeleted: true }).length
  const key = count === 0
    ? 'costs.confirm.deleteBody'
    : count === 1
      ? 'costs.confirm.deleteBodyWithFile'
      : 'costs.confirm.deleteBodyWithFiles'
  return { count, message: t(key, { name: expense.name, count }) }
}

export function attachmentCreatedAt(file: TripFile, expenseId?: number): string {
  if (expenseId != null) return file.expense_attachment_created_at?.[String(expenseId)] || file.created_at || ''
  return file.created_at || ''
}

export function filesForExpense(
  files: TripFile[],
  expenseId: number,
  options: { includeDeleted?: boolean } = {},
): TripFile[] {
  const { includeDeleted = false } = options
  return files
    .filter(file => (includeDeleted || !file.deleted_at) && file.linked_expense_ids?.includes(expenseId))
    .sort((a, b) => attachmentCreatedAt(a, expenseId).localeCompare(attachmentCreatedAt(b, expenseId)) || a.id - b.id)
}
