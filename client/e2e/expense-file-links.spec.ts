import { test, expect, type Page } from '@playwright/test'
import { dismissSystemNotices } from './helpers'

interface SeededExpenseFile {
  tripId: number
  expenseId: number
  expenseName: string
  fileId: number
  fileName: string
}

async function seedExpenseFile(page: Page): Promise<SeededExpenseFile> {
  for (const addon of ['budget', 'documents']) {
    const response = await page.request.put(`/api/admin/addons/${addon}`, { data: { enabled: true } })
    expect(response.ok()).toBeTruthy()
  }

  const expenseName = `Lifecycle dinner ${Date.now()}`
  const fileName = `lifecycle-receipt-${Date.now()}.pdf`
  const tripResponse = await page.request.post('/api/trips', {
    data: { title: `E2E expense file links ${Date.now()}`, currency: 'EUR' },
  })
  expect(tripResponse.ok()).toBeTruthy()
  const { trip } = await tripResponse.json() as { trip: { id: number } }

  const expenseResponse = await page.request.post(`/api/trips/${trip.id}/budget`, {
    data: { name: expenseName, category: 'food', total_price: 24 },
  })
  expect(expenseResponse.ok()).toBeTruthy()
  const { item } = await expenseResponse.json() as { item: { id: number } }

  const fileResponse = await page.request.post(`/api/trips/${trip.id}/files`, {
    multipart: {
      file: { name: fileName, mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4\n') },
    },
  })
  expect(fileResponse.ok()).toBeTruthy()
  const { file } = await fileResponse.json() as { file: { id: number } }

  const attachmentResponse = await page.request.post(`/api/trips/${trip.id}/budget/${item.id}/files/${file.id}`)
  expect(attachmentResponse.ok()).toBeTruthy()

  return { tripId: trip.id, expenseId: item.id, expenseName, fileId: file.id, fileName }
}

async function acceptBrowserConfirm(page: Page, action: () => Promise<void>, expectedText: string): Promise<void> {
  const dialogPromise = page.waitForEvent('dialog')
  const actionPromise = action()
  const dialog = await dialogPromise
  expect(dialog.type()).toBe('confirm')
  expect(dialog.message()).toContain(expectedText)
  await dialog.accept()
  await actionPromise
}

async function toggleExpenseLink(page: Page, seeded: SeededExpenseFile, method: 'POST' | 'DELETE', pressed: string): Promise<void> {
  const responsePromise = page.waitForResponse(response =>
    response.url().includes(`/api/trips/${seeded.tripId}/budget/${seeded.expenseId}/files/${seeded.fileId}`)
      && response.request().method() === method,
  )
  await page.getByRole('button', { name: seeded.expenseName, exact: true }).click()
  expect((await responsePromise).ok()).toBeTruthy()
  await expect(page.getByRole('button', { name: seeded.expenseName, exact: true })).toHaveAttribute('aria-pressed', pressed)
}

test('manages an Expense/File link across Files, trash, restore, and deletion', async ({ page }) => {
  const seeded = await seedExpenseFile(page)

  await page.goto(`/trips/${seeded.tripId}/files`)
  await dismissSystemNotices(page)
  await expect(page.getByText(seeded.fileName, { exact: true })).toBeVisible()
  await expect(page.getByText(`From Expense · ${seeded.expenseName}`, { exact: true })).toBeVisible()

  await page.getByTitle('Assign').click()
  await expect(page.getByText('Expense', { exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: seeded.expenseName, exact: true })).toHaveAttribute('aria-pressed', 'true')
  await toggleExpenseLink(page, seeded, 'DELETE', 'false')
  await toggleExpenseLink(page, seeded, 'POST', 'true')
  await page.getByRole('button', { name: 'Close' }).click()

  const fileRow = page.locator('.file-actions').first()
  const liveDeleteResponse = page.waitForResponse(response =>
    response.url().includes(`/api/trips/${seeded.tripId}/files/${seeded.fileId}`)
      && response.request().method() === 'DELETE',
  )
  await acceptBrowserConfirm(
    page,
    () => fileRow.getByTitle('Delete').click(),
    '1 live Expense',
  )
  expect((await liveDeleteResponse).ok()).toBeTruthy()
  await expect(page.getByText(seeded.fileName, { exact: true })).not.toBeVisible()

  const trashListResponse = page.waitForResponse(response =>
    response.url().includes(`/api/trips/${seeded.tripId}/files`)
      && response.url().includes('trash=true')
      && response.request().method() === 'GET',
  )
  await page.getByRole('button', { name: 'Trash', exact: true }).click()
  const trashList = await trashListResponse
  expect(trashList.ok()).toBeTruthy()
  const trashBody = await trashList.json() as { files: Array<{ id: number; original_name?: string }> }
  expect(trashBody.files.some(file => file.id === seeded.fileId && file.original_name === seeded.fileName)).toBeTruthy()
  await expect(page.getByText(seeded.fileName, { exact: true })).toBeVisible()
  await expect(page.getByText(`From Expense · ${seeded.expenseName}`, { exact: true })).toBeVisible()
  const restoreResponse = page.waitForResponse(response =>
    response.url().includes(`/api/trips/${seeded.tripId}/files/${seeded.fileId}/restore`)
      && response.request().method() === 'POST',
  )
  await page.getByTitle('Restore').click()
  expect((await restoreResponse).ok()).toBeTruthy()
  await expect(page.getByText(seeded.fileName, { exact: true })).not.toBeVisible()

  await page.getByRole('button', { name: 'Trash', exact: true }).click()
  await expect(page.getByText(seeded.fileName, { exact: true })).toBeVisible()
  await expect(page.getByText(`From Expense · ${seeded.expenseName}`, { exact: true })).toBeVisible()

  await page.goto(`/trips/${seeded.tripId}?tab=finanzplan`)
  await dismissSystemNotices(page)
  const expenseRow = page.locator('.exp-row').filter({ hasText: seeded.expenseName }).first()
  await expect(expenseRow).toBeVisible()
  await expect(expenseRow.getByRole('button', { name: '1 attachment', exact: true })).toBeVisible()
  await acceptBrowserConfirm(
    page,
    () => page.locator('.exp-actions button[title="Delete"]').first().click(),
    '1 attached File',
  )
  await expect(expenseRow).not.toBeVisible()

  await page.goto(`/trips/${seeded.tripId}/files`)
  await dismissSystemNotices(page)
  await expect(page.getByText(seeded.fileName, { exact: true })).toBeVisible()
  await expect(page.getByText(`From Expense · ${seeded.expenseName}`, { exact: true })).not.toBeVisible()

  await acceptBrowserConfirm(
    page,
    () => page.locator('.file-actions').first().getByTitle('Delete').click(),
    'Are you sure you want to delete this file?',
  )
  await page.getByRole('button', { name: 'Trash', exact: true }).click()
  await expect(page.getByText(seeded.fileName, { exact: true })).toBeVisible()
  await acceptBrowserConfirm(
    page,
    () => page.getByTitle('Delete').click(),
    'Permanently delete this file?',
  )
  await expect(page.getByText(seeded.fileName, { exact: true })).not.toBeVisible()
})
