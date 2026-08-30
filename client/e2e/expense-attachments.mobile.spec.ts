import { test, expect, type Page } from '@playwright/test'
import { dismissSystemNotices } from './helpers'

async function seedMobileExpenseFile(page: Page) {
  for (const addon of ['budget', 'documents']) {
    const response = await page.request.put(`/api/admin/addons/${addon}`, { data: { enabled: true } })
    expect(response.ok()).toBeTruthy()
  }
  const tripResponse = await page.request.post('/api/trips', {
    data: { title: `E2E mobile expense files ${Date.now()}`, currency: 'EUR' },
  })
  expect(tripResponse.ok()).toBeTruthy()
  const { trip } = await tripResponse.json() as { trip: { id: number } }
  const expenseName = 'Mobile dinner receipt'
  const expenseResponse = await page.request.post(`/api/trips/${trip.id}/budget`, {
    data: { name: expenseName, category: 'food', total_price: 24 },
  })
  expect(expenseResponse.ok()).toBeTruthy()
  const { item } = await expenseResponse.json() as { item: { id: number } }
  const fileResponse = await page.request.post(`/api/trips/${trip.id}/files`, {
    multipart: {
      file: { name: 'mobile-receipt.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4\n') },
    },
  })
  expect(fileResponse.ok()).toBeTruthy()
  const { file } = await fileResponse.json() as { file: { id: number } }
  const attachmentResponse = await page.request.post(`/api/trips/${trip.id}/budget/${item.id}/files/${file.id}`)
  expect(attachmentResponse.ok()).toBeTruthy()
  return { tripId: trip.id, expenseName }
}

test('shows the same live attachment relationship in the mobile Costs sheet', async ({ page }) => {
  const seeded = await seedMobileExpenseFile(page)

  await page.goto(`/trips/${seeded.tripId}?tab=finanzplan`)
  await dismissSystemNotices(page)
  await expect(page.getByText(seeded.expenseName, { exact: true })).toBeVisible()
  await page.getByRole('button', { name: '1 attachment', exact: true }).click()
  await expect(page.getByRole('heading', { name: `Attachments for "${seeded.expenseName}"` })).toBeVisible()
  await expect(page.getByTestId('expense-attachment-name')).toHaveText('mobile-receipt.pdf')
})
