/**
 * Expense/File attachment e2e coverage. The real auth and trip-access guards,
 * FilesService SQL, attachment SQL, response enrichment, permission checks and
 * realtime boundary all run through the Nest HTTP surface.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi, type MockInstance } from 'vitest';
import request from 'supertest';
import cookieParser from 'cookie-parser';
import type { Server } from 'http';
import { Test } from '@nestjs/testing';
import { sessionCookie } from './harness';

const { db } = vi.hoisted(() => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const Database = require('better-sqlite3');
  const tmp = new Database(':memory:');
  tmp.exec('PRAGMA journal_mode = WAL');
  tmp.exec('PRAGMA foreign_keys = ON');
  return { db: tmp };
});

const { canAccessTrip } = vi.hoisted(() => ({ canAccessTrip: vi.fn() }));
vi.mock('../../src/db/database', () => ({
  db,
  canAccessTrip,
  isOwner: vi.fn(() => true),
  getPlaceWithTags: vi.fn(),
  closeDb: () => {},
  reinitialize: () => {},
}));
vi.mock('../../src/websocket', () => ({ broadcast: vi.fn() }));

import { createTables } from '../../src/db/schema';
import { runMigrations } from '../../src/db/migrations';
import { DatabaseModule } from '../../src/nest/database/database.module';
import { RealtimeModule } from '../../src/nest/realtime/realtime.module';
import { BudgetModule } from '../../src/nest/budget/budget.module';
import { ExpenseAttachmentsModule } from '../../src/nest/expense-attachments/expense-attachments.module';
import { PermissionsService } from '../../src/nest/permissions/permissions.service';
import { RealtimeService } from '../../src/nest/realtime/realtime.service';
import { TrekExceptionFilter } from '../../src/nest/common/trek-exception.filter';

describe('Expense attachments e2e', () => {
  let server: Server;
  let app: Awaited<ReturnType<typeof build>>;
  let checkPermission: MockInstance;
  let broadcast: MockInstance;
  let tripId: number;
  let otherTripId: number;
  let expenseId: number;
  let secondExpenseId: number;
  let otherExpenseId: number;
  let fileId: number;
  let otherFileId: number;
  let reservationId: number;
  let placeId: number;

  async function build() {
    const moduleRef = await Test.createTestingModule({
      imports: [DatabaseModule, RealtimeModule, BudgetModule, ExpenseAttachmentsModule],
    }).compile();
    const nest = moduleRef.createNestApplication();
    nest.use(cookieParser());
    nest.useGlobalFilters(new TrekExceptionFilter());
    await nest.init();
    return nest;
  }

  beforeAll(async () => {
    createTables(db);
    runMigrations(db);
    db.prepare(
      "INSERT INTO users (id, username, email, password_hash, role, password_version) VALUES (1, 'e2e-user', 'e2e@example.test', 'x', 'user', 0)",
    ).run();
    tripId = Number(db.prepare("INSERT INTO trips (user_id, title, currency) VALUES (1, 'Trip one', 'EUR')").run().lastInsertRowid);
    otherTripId = Number(db.prepare("INSERT INTO trips (user_id, title, currency) VALUES (1, 'Trip two', 'EUR')").run().lastInsertRowid);
    expenseId = Number(db.prepare("INSERT INTO budget_items (trip_id, name, category, total_price) VALUES (?, 'Dinner', 'food', 20)").run(tripId).lastInsertRowid);
    secondExpenseId = Number(db.prepare("INSERT INTO budget_items (trip_id, name, category, total_price) VALUES (?, 'Museum', 'activity', 10)").run(tripId).lastInsertRowid);
    otherExpenseId = Number(db.prepare("INSERT INTO budget_items (trip_id, name, category, total_price) VALUES (?, 'Other', 'other', 5)").run(otherTripId).lastInsertRowid);
    reservationId = Number(db.prepare("INSERT INTO reservations (trip_id, title) VALUES (?, 'Dinner booking')").run(tripId).lastInsertRowid);
    placeId = Number(db.prepare("INSERT INTO places (trip_id, name) VALUES (?, 'Dinner restaurant')").run(tripId).lastInsertRowid);
    fileId = Number(db.prepare("INSERT INTO trip_files (trip_id, filename, original_name, file_size, mime_type, uploaded_by) VALUES (?, 'dinner.pdf', 'dinner.pdf', 100, 'application/pdf', 1)").run(tripId).lastInsertRowid);
    otherFileId = Number(db.prepare("INSERT INTO trip_files (trip_id, filename, original_name, file_size, mime_type, uploaded_by) VALUES (?, 'other.pdf', 'other.pdf', 100, 'application/pdf', 1)").run(otherTripId).lastInsertRowid);
    app = await build();
    checkPermission = vi.spyOn(app.get(PermissionsService), 'checkPermission');
    broadcast = vi.spyOn(app.get(RealtimeService), 'broadcast');
    server = app.getHttpServer();
  });

  beforeEach(() => {
    db.prepare('DELETE FROM file_links').run();
    canAccessTrip.mockReturnValue({ id: tripId, user_id: 1, currency: 'EUR' });
    checkPermission.mockReturnValue(true);
    broadcast.mockClear();
  });

  afterAll(async () => {
    await app.close();
    db.close();
  });

  it('requires authentication and trip access to view attachments', async () => {
    expect((await request(server).get(`/api/trips/${tripId}/budget/${expenseId}/files`)).status).toBe(401);

    canAccessTrip.mockReturnValue(undefined);
    const inaccessible = await request(server)
      .get(`/api/trips/${tripId}/budget/${expenseId}/files`)
      .set('Cookie', sessionCookie(1));
    expect(inaccessible.status).toBe(404);
    expect(inaccessible.body).toEqual({ error: 'Trip not found' });
  });

  it('lists attached live files and exposes relationship metadata on the trip file response', async () => {
    db.prepare('INSERT INTO file_links (file_id, reservation_id) VALUES (?, ?)').run(fileId, reservationId);
    db.prepare('INSERT INTO file_links (budget_item_id, file_id, created_at) VALUES (?, ?, ?)')
      .run(expenseId, fileId, '2026-08-30 10:00:00');

    const expenseFiles = await request(server)
      .get(`/api/trips/${tripId}/budget/${expenseId}/files`)
      .set('Cookie', sessionCookie(1));
    expect(expenseFiles.status).toBe(200);
    expect(expenseFiles.body.files).toHaveLength(1);
    expect(expenseFiles.body.files[0]).toMatchObject({ id: fileId, original_name: 'dinner.pdf' });

    const tripFiles = await request(server)
      .get(`/api/trips/${tripId}/files`)
      .set('Cookie', sessionCookie(1));
    expect(tripFiles.body.files[0]).toMatchObject({
      id: fileId,
      linked_reservation_ids: [reservationId],
      linked_budget_item_ids: [expenseId],
      expense_attachment_created_at: { [String(expenseId)]: '2026-08-30 10:00:00' },
    });
  });

  it('serves receipt_file_ids through the focused route and preserves co-located links when detached', async () => {
    const created = await request(server)
      .post(`/api/trips/${tripId}/budget`)
      .set('Cookie', sessionCookie(1))
      .send({ name: 'Receipt-backed dinner', total_price: 20, receipt_file_ids: [fileId] });
    expect(created.status).toBe(201);
    const receiptExpenseId = created.body.item.id as number;

    db.prepare(`
      UPDATE file_links
      SET reservation_id = ?, place_id = ?, created_at = ?
      WHERE file_id = ? AND budget_item_id = ?
    `).run(reservationId, placeId, '2026-08-30 10:00:00', fileId, receiptExpenseId);

    const listed = await request(server)
      .get(`/api/trips/${tripId}/budget/${receiptExpenseId}/files`)
      .set('Cookie', sessionCookie(1));
    expect(listed.status).toBe(200);
    expect(listed.body.files).toHaveLength(1);
    expect(listed.body.files[0]).toMatchObject({
      id: fileId,
      linked_budget_item_ids: [receiptExpenseId],
      linked_reservation_ids: [reservationId],
      linked_place_ids: [placeId],
      expense_attachment_created_at: { [String(receiptExpenseId)]: '2026-08-30 10:00:00' },
    });

    const detached = await request(server)
      .delete(`/api/trips/${tripId}/budget/${receiptExpenseId}/files/${fileId}`)
      .set('Cookie', sessionCookie(1));
    expect(detached.status).toBe(200);
    expect(detached.body.file).toMatchObject({
      id: fileId,
      linked_budget_item_ids: [],
      linked_reservation_ids: [reservationId],
      linked_place_ids: [placeId],
      expense_attachment_created_at: {},
    });
    expect(db.prepare('SELECT budget_item_id, reservation_id, place_id FROM file_links WHERE file_id = ?').get(fileId))
      .toEqual({ budget_item_id: null, reservation_id: reservationId, place_id: placeId });
  });

  it('uses budget_edit for receipt_file_ids without requiring file_edit', async () => {
    checkPermission.mockImplementation((action: string) => action === 'budget_edit');
    const allowed = await request(server)
      .post(`/api/trips/${tripId}/budget`)
      .set('Cookie', sessionCookie(1))
      .send({ name: 'Allowed receipt', total_price: 1, receipt_file_ids: [fileId] });
    expect(allowed.status).toBe(201);
    expect(db.prepare('SELECT budget_item_id FROM file_links WHERE file_id = ?').get(fileId))
      .toEqual({ budget_item_id: allowed.body.item.id });
  });

  it('broadcasts enriched receipt mutations and keeps booking/place links when receipt_file_ids clears them', async () => {
    const created = await request(server)
      .post(`/api/trips/${tripId}/budget`)
      .set('Cookie', sessionCookie(1))
      .set('X-Socket-Id', 'receipt-origin')
      .send({ name: 'Collaborative receipt', total_price: 8, receipt_file_ids: [fileId] });
    expect(created.status).toBe(201);
    const receiptExpenseId = created.body.item.id as number;
    expect(broadcast).toHaveBeenCalledWith(
      String(tripId),
      'file:updated',
      expect.objectContaining({ file: expect.objectContaining({
        id: fileId,
        linked_budget_item_ids: [receiptExpenseId],
        expense_attachment_created_at: expect.objectContaining({ [String(receiptExpenseId)]: expect.any(String) }),
      }) }),
      'receipt-origin',
    );

    db.prepare(`
      UPDATE file_links SET reservation_id = ?, place_id = ?
      WHERE file_id = ? AND budget_item_id = ?
    `).run(reservationId, placeId, fileId, receiptExpenseId);
    broadcast.mockClear();

    const cleared = await request(server)
      .put(`/api/trips/${tripId}/budget/${receiptExpenseId}`)
      .set('Cookie', sessionCookie(1))
      .set('X-Socket-Id', 'receipt-origin')
      .send({ receipt_file_ids: [] });
    expect(cleared.status).toBe(200);
    expect(db.prepare('SELECT budget_item_id, reservation_id, place_id FROM file_links WHERE file_id = ?').get(fileId))
      .toEqual({ budget_item_id: null, reservation_id: reservationId, place_id: placeId });
    expect(broadcast).toHaveBeenCalledWith(
      String(tripId),
      'file:updated',
      expect.objectContaining({ file: expect.objectContaining({
        id: fileId,
        linked_budget_item_ids: [],
        linked_reservation_ids: [reservationId],
        linked_place_ids: [placeId],
        expense_attachment_created_at: {},
      }) }),
      'receipt-origin',
    );
  });

  it('attaches idempotently, supports one file on multiple expenses, and excludes the origin socket', async () => {
    db.prepare('INSERT INTO file_links (file_id, reservation_id) VALUES (?, ?)').run(fileId, reservationId);
    const first = await request(server)
      .post(`/api/trips/${tripId}/budget/${expenseId}/files/${fileId}`)
      .set('Cookie', sessionCookie(1))
      .set('X-Socket-Id', 'origin-socket');
    expect(first.status).toBe(200);
    expect(first.body.file.linked_budget_item_ids).toEqual([expenseId]);
    expect(first.body.file.linked_reservation_ids).toEqual([reservationId]);

    const duplicate = await request(server)
      .post(`/api/trips/${tripId}/budget/${expenseId}/files/${fileId}`)
      .set('Cookie', sessionCookie(1));
    expect(duplicate.status).toBe(200);
    expect(db.prepare('SELECT COUNT(*) AS count FROM file_links WHERE budget_item_id = ? AND file_id = ?').get(expenseId, fileId)).toEqual({ count: 1 });

    const second = await request(server)
      .post(`/api/trips/${tripId}/budget/${secondExpenseId}/files/${fileId}`)
      .set('Cookie', sessionCookie(1));
    expect(second.status).toBe(200);
    expect(second.body.file.linked_budget_item_ids).toEqual([expenseId, secondExpenseId]);
    expect(broadcast).toHaveBeenCalledWith(tripId.toString(), 'file:updated', expect.objectContaining({ file: expect.any(Object) }), 'origin-socket');
  });

  it('detaches idempotently and cascades relationship rows without deleting the file', async () => {
    db.prepare('INSERT INTO file_links (budget_item_id, file_id) VALUES (?, ?)').run(expenseId, fileId);

    const detached = await request(server)
      .delete(`/api/trips/${tripId}/budget/${expenseId}/files/${fileId}`)
      .set('Cookie', sessionCookie(1));
    expect(detached.status).toBe(200);
    expect(detached.body).toMatchObject({ success: true, file: { id: fileId, linked_budget_item_ids: [] } });

    const duplicate = await request(server)
      .delete(`/api/trips/${tripId}/budget/${expenseId}/files/${fileId}`)
      .set('Cookie', sessionCookie(1));
    expect(duplicate.status).toBe(200);
    expect(db.prepare('SELECT COUNT(*) AS count FROM file_links').get()).toEqual({ count: 0 });

    const cascadeExpenseId = Number(db.prepare("INSERT INTO budget_items (trip_id, name, category, total_price) VALUES (?, 'Cascade', 'other', 1)").run(tripId).lastInsertRowid);
    db.prepare('INSERT INTO file_links (budget_item_id, file_id) VALUES (?, ?)').run(cascadeExpenseId, fileId);
    db.prepare('DELETE FROM budget_items WHERE id = ?').run(cascadeExpenseId);
    expect(db.prepare('SELECT id FROM file_links WHERE budget_item_id = ?').get(cascadeExpenseId)).toBeUndefined();
    expect(db.prepare('SELECT id FROM trip_files WHERE id = ?').get(fileId)).toEqual({ id: fileId });
  });

  it('returns one generic not-found result for cross-trip expense/file identities', async () => {
    const foreignExpense = await request(server)
      .post(`/api/trips/${tripId}/budget/${otherExpenseId}/files/${fileId}`)
      .set('Cookie', sessionCookie(1));
    expect(foreignExpense.status).toBe(404);
    expect(foreignExpense.body).toEqual({ error: 'Expense or file not found' });

    const foreignFile = await request(server)
      .post(`/api/trips/${tripId}/budget/${secondExpenseId}/files/${otherFileId}`)
      .set('Cookie', sessionCookie(1));
    expect(foreignFile.status).toBe(404);
    expect(foreignFile.body).toEqual({ error: 'Expense or file not found' });
  });

  it('accepts either existing edit permission for the shared REST relationship', async () => {
    checkPermission.mockImplementation((action: string) => action === 'budget_edit');
    const attach = await request(server)
      .post(`/api/trips/${tripId}/budget/${secondExpenseId}/files/${fileId}`)
      .set('Cookie', sessionCookie(1));
    expect(attach.status).toBe(200);

    const detach = await request(server)
      .delete(`/api/trips/${tripId}/budget/${secondExpenseId}/files/${fileId}`)
      .set('Cookie', sessionCookie(1));
    expect(detach.status).toBe(200);

    checkPermission.mockImplementation((action: string) => action === 'file_edit');
    const filesEdit = await request(server)
      .post(`/api/trips/${tripId}/budget/${secondExpenseId}/files/${fileId}`)
      .set('Cookie', sessionCookie(1));
    expect(filesEdit.status).toBe(200);
    checkPermission.mockReturnValue(false);
    const denied = await request(server)
      .delete(`/api/trips/${tripId}/budget/${secondExpenseId}/files/${fileId}`)
      .set('Cookie', sessionCookie(1));
    expect(denied.status).toBe(403);

    checkPermission.mockReturnValue(true);
    const visible = await request(server)
      .get(`/api/trips/${tripId}/budget/${secondExpenseId}/files`)
      .set('Cookie', sessionCookie(1));
    expect(visible.status).toBe(200);
  });
});
