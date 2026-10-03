import { test, expect, type Page } from '@playwright/test'
import { dismissSystemNotices } from './helpers'

interface SeededExpenseFiles {
  tripId: number
  expenseId: number
  expenseName: string
  imageName: string
  pdfName: string
  markdownName: string
}

async function seedExpenseFiles(page: Page, label: string): Promise<SeededExpenseFiles> {
  for (const addon of ['budget', 'documents']) {
    const response = await page.request.put(`/api/admin/addons/${addon}`, { data: { enabled: true } })
    expect(response.ok()).toBeTruthy()
  }

  const expenseName = `E2E receipt ${label}`
  const imageName = `e2e-receipt-${label}.png`
  const pdfName = `e2e-receipt-${label}.pdf`
  const markdownName = `e2e-receipt-${label}.md`
  const tripResponse = await page.request.post('/api/trips', {
    data: { title: `E2E expense files ${label}`, currency: 'EUR' },
  })
  expect(tripResponse.ok()).toBeTruthy()
  const { trip } = await tripResponse.json() as { trip: { id: number } }

  const expenseResponse = await page.request.post(`/api/trips/${trip.id}/budget`, {
    data: { name: expenseName, category: 'food', total_price: 24 },
  })
  expect(expenseResponse.ok()).toBeTruthy()
  const { item } = await expenseResponse.json() as { item: { id: number } }

  const uploads = [
    {
      name: imageName,
      mimeType: 'image/png',
      // A valid 1x1 PNG keeps the image preview assertion browser-real.
      buffer: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=', 'base64'),
    },
    { name: pdfName, mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4\n') },
    { name: markdownName, mimeType: 'text/markdown', buffer: Buffer.from('# Receipt notes\n\nKeep this copy.') },
  ]
  const fileIds: number[] = []
  for (const upload of uploads) {
    const fileResponse = await page.request.post(`/api/trips/${trip.id}/files`, { multipart: { file: upload } })
    expect(fileResponse.ok()).toBeTruthy()
    const { file } = await fileResponse.json() as { file: { id: number } }
    fileIds.push(file.id)
  }

  const descriptionResponse = await page.request.put(`/api/trips/${trip.id}/files/${fileIds[1]}`, {
    data: { description: 'Receipt PDF description' },
  })
  expect(descriptionResponse.ok()).toBeTruthy()

  for (const fileId of fileIds) {
    const attachmentResponse = await page.request.post(`/api/trips/${trip.id}/budget/${item.id}/files/${fileId}`)
    expect(attachmentResponse.ok()).toBeTruthy()
  }

  return { tripId: trip.id, expenseId: item.id, expenseName, imageName, pdfName, markdownName }
}

test('inspects live Expense attachments with Costs read-only presentation', async ({ page }) => {
  const seeded = await seedExpenseFiles(page, String(Date.now()))

  await page.goto(`/trips/${seeded.tripId}?tab=finanzplan`)
  await dismissSystemNotices(page)
  const expenseRow = page.locator('.exp-row').filter({ hasText: seeded.expenseName }).first()
  await expect(expenseRow).toBeVisible()
  await expect(expenseRow.getByRole('button', { name: '3 attachments', exact: true })).toBeVisible()

  let tokenRequests = 0
  page.on('request', request => {
    if (request.url().endsWith('/api/auth/resource-token')) tokenRequests++
  })
  await expenseRow.getByRole('button', { name: '3 attachments', exact: true }).click()
  const viewer = page.getByRole('dialog', { name: `Attachments for "${seeded.expenseName}"` })
  await expect(viewer).toBeVisible()
  expect(await viewer.getByTestId('expense-attachment-name').allTextContents()).toEqual([
    seeded.imageName,
    seeded.pdfName,
    seeded.markdownName,
  ])
  await expect(viewer.getByText('9 B')).toBeVisible()
  await expect(viewer.getByText('Receipt PDF description')).toBeVisible()
  await expect(viewer.locator('input, textarea, select')).toHaveCount(0)

  await viewer.getByTestId('expense-attachment-name').nth(0).click()
  await expect(page.getByText('1 / 1')).toBeVisible()
  await expect(page.getByAltText(seeded.imageName)).toBeVisible()
  await page.locator('[role="presentation"]')
    .filter({ has: page.getByAltText(seeded.imageName) })
    .last()
    .click({ position: { x: 1, y: 1 } })

  await viewer.getByTestId('expense-attachment-name').nth(1).click()
  await expect(page.locator(`object[title="${seeded.pdfName}"]`)).toHaveAttribute('data', /token=/)
  await page.locator('[role="presentation"]')
    .filter({ has: page.locator(`object[title="${seeded.pdfName}"]`) })
    .first()
    .click({ position: { x: 1, y: 1 } })

  await viewer.getByTestId('expense-attachment-name').nth(2).click()
  await expect(page.getByText('Receipt notes')).toBeVisible()
  expect(tokenRequests).toBeLessThan(12)
  await page.getByRole('dialog', { name: seeded.markdownName }).getByRole('button', { name: 'Close', exact: true }).click()
  await page.context().setOffline(true)
  try {
    await viewer.getByTestId('expense-attachment-name').nth(1).click()
    await expect(page.getByRole('dialog', { name: seeded.pdfName }).getByRole('alert')).toBeVisible()
    await expect(viewer.getByTestId('expense-attachment-name')).toHaveCount(3)
  } finally {
    await page.context().setOffline(false)
  }
})


test('cancels staged files and retries a saved upload without uploading it twice', async ({ page }) => {
  const seeded = await seedExpenseFiles(page, `staging-${Date.now()}`)
  const uploadName = `staged-receipt-${Date.now()}.pdf`
  let uploads = 0
  page.on('request', request => {
    if (request.method() === 'POST' && request.url().endsWith(`/api/trips/${seeded.tripId}/files`)) uploads++
  })
  await page.goto(`/trips/${seeded.tripId}?tab=finanzplan`)
  await dismissSystemNotices(page)
  await page.getByRole('button', { name: 'Edit', exact: true }).click()
  let editor = page.getByRole('dialog')
  await editor.getByRole('checkbox', { name: seeded.pdfName, exact: true }).uncheck()
  await editor.getByRole('tab', { name: /^Upload/ }).click()
  await editor.getByTestId('expense-upload-input').setInputFiles({
    name: uploadName, mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4\n'),
  })
  await expect(editor.getByText(uploadName, { exact: true })).toBeVisible()
  await editor.getByRole('button', { name: 'Cancel', exact: true }).click()
  await expect(editor).not.toBeVisible()
  expect(uploads).toBe(0)
  const unchanged = await page.request.get(`/api/trips/${seeded.tripId}/budget/${seeded.expenseId}/files`)
  expect((await unchanged.json()).files).toHaveLength(3)

  let failAttachment = true
  await page.route(`**/api/trips/${seeded.tripId}/budget/${seeded.expenseId}/files/*`, async route => {
    if (route.request().method() === 'POST' && failAttachment) {
      failAttachment = false
      await route.fulfill({ status: 500, json: { error: 'Test attachment failure' } })
    } else await route.continue()
  })
  await page.getByRole('button', { name: 'Edit', exact: true }).click()
  editor = page.getByRole('dialog')
  await editor.getByRole('checkbox', { name: seeded.pdfName, exact: true }).uncheck()
  await editor.getByRole('checkbox', { name: seeded.markdownName, exact: true }).uncheck()
  await editor.getByRole('tab', { name: /^Upload/ }).click()
  await editor.getByTestId('expense-upload-input').setInputFiles({
    name: uploadName, mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4\n'),
  })
  await expect(editor.getByText(uploadName, { exact: true })).toBeVisible()
  await editor.getByRole('button', { name: 'Save', exact: true }).click()
  await expect(editor.getByTestId('expense-attachment-failure-summary')).toBeVisible()
  expect(uploads).toBe(1)
  await editor.getByRole('button', { name: `Retry ${uploadName}`, exact: true }).click()
  await expect(editor).not.toBeVisible()
  expect(uploads).toBe(1)
  const attached = await page.request.get(`/api/trips/${seeded.tripId}/budget/${seeded.expenseId}/files`)
  expect((await attached.json()).files.map((file: { original_name: string }) => file.original_name)).toEqual([
    seeded.imageName, uploadName,
  ])
  const allFiles = await page.request.get(`/api/trips/${seeded.tripId}/files`)
  expect((await allFiles.json()).files).toHaveLength(4)
})
