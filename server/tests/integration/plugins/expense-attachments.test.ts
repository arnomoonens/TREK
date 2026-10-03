/**
 * Production plugin-RPC harness coverage for the Costs ↔ Files relationship.
 * The public helper wires the same domain services and registry as the runtime;
 * these cases therefore exercise persisted relationships, trip isolation and
 * realtime broadcasts instead of a stubbed attachment service.
 */
import { describe, it, expect, vi, beforeAll, beforeEach, afterAll } from 'vitest';

const { testDb, dbMock, socketBroadcast } = vi.hoisted(() => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const Database = require('better-sqlite3');
  const db = new Database(':memory:');
  db.exec('PRAGMA journal_mode = WAL');
  db.exec('PRAGMA foreign_keys = ON');
  db.exec('PRAGMA busy_timeout = 5000');
  const mock = {
    db,
    closeDb: () => {},
    reinitialize: () => {},
    canAccessTrip: (tripId: number | string, userId: number) => db.prepare(`
      SELECT t.id, t.user_id, t.currency FROM trips t
      LEFT JOIN trip_members m ON m.trip_id = t.id AND m.user_id = ?
      WHERE t.id = ? AND (t.user_id = ? OR m.user_id IS NOT NULL)
    `).get(userId, tripId, userId),
    isOwner: (tripId: number | string, userId: number) =>
      !!db.prepare('SELECT id FROM trips WHERE id = ? AND user_id = ?').get(tripId, userId),
    getPlaceWithTags: () => null,
  };
  return { testDb: db, dbMock: mock, socketBroadcast: vi.fn() };
});

vi.mock('../../../src/db/database', () => dbMock);
vi.mock('../../../src/websocket', () => ({
  broadcast: socketBroadcast,
  broadcastToUser: vi.fn(),
  getOnlineUserIds: () => new Set<number>(),
}));

import { createTables } from '../../../src/db/schema';
import { runMigrations } from '../../../src/db/migrations';
import { DatabaseService } from '../../../src/nest/database/database.service';
import { PluginRpcHost } from '../../../src/nest/plugins/host/rpc-host';
import { createPluginRpcHostFactory } from '../../helpers/plugin-host';
import { resetTestDb } from '../../helpers/test-db';
import { addTripMember, createBudgetItem, createTrip, createUser } from '../../helpers/factories';
import { invalidatePermissionsCache } from '../../../src/nest/permissions/permissions-cache';
import type { RpcError, RpcRequest } from '../../../src/nest/plugins/protocol/envelope';

const READ_GRANTS = ['db:read:costs', 'db:read:files'];
const WRITE_GRANTS = ['db:write:costs', 'db:write:files'];
const ALL_GRANTS = [...READ_GRANTS, ...WRITE_GRANTS];

const req = (method: string, params: Record<string, unknown>): RpcRequest => ({
  k: 'req',
  id: 'expense-attachments-harness',
  method,
  params,
});

function insertFile(tripId: number, userId: number, name: string, deletedAt: string | null = null): number {
  return Number(testDb.prepare(`
    INSERT INTO trip_files (trip_id, filename, original_name, file_size, mime_type, uploaded_by, deleted_at)
    VALUES (?, ?, ?, 100, 'application/pdf', ?, ?)
  `).run(tripId, name, name, userId, deletedAt).lastInsertRowid);
}

describe('Expense attachment plugin RPC production harness', () => {
  let hostFactory: ReturnType<typeof createPluginRpcHostFactory>;

  beforeAll(() => {
    createTables(testDb);
    runMigrations(testDb);
    hostFactory = createPluginRpcHostFactory(new DatabaseService(testDb));
  });

  beforeEach(() => {
    resetTestDb(testDb);
    invalidatePermissionsCache();
    socketBroadcast.mockClear();
  });

  afterAll(() => testDb.close());

  function host(grants: string[]): PluginRpcHost {
    return hostFactory.create('expense-attachments-harness', new Set(grants), {
      callPlugin: async () => undefined,
      emitPluginEvent: () => {},
    });
  }

  it('dispatches persisted list/attach/detach operations, reuses a File, and broadcasts only changes', async () => {
    const { user } = createUser(testDb);
    const trip = createTrip(testDb, user.id);
    const first = createBudgetItem(testDb, trip.id, { name: 'Dinner' });
    const second = createBudgetItem(testDb, trip.id, { name: 'Hotel' });
    const fileId = insertFile(trip.id, user.id, 'receipt.pdf');
    const rpc = host(ALL_GRANTS);

    const initially = await rpc.dispatch(req('costs.listFiles', { tripId: trip.id, expenseId: first.id }), user.id);
    expect(initially).toMatchObject({ ok: true, result: [] });

    expect((await rpc.dispatch(req('costs.attachFile', { tripId: trip.id, expenseId: first.id, fileId }), user.id)).ok).toBe(true);
    expect((await rpc.dispatch(req('costs.attachFile', { tripId: trip.id, expenseId: first.id, fileId }), user.id)).ok).toBe(true);
    expect((await rpc.dispatch(req('costs.attachFile', { tripId: trip.id, expenseId: second.id, fileId }), user.id)).ok).toBe(true);
    expect((await rpc.dispatch(req('costs.detachFile', { tripId: trip.id, expenseId: first.id, fileId }), user.id)).ok).toBe(true);
    expect((await rpc.dispatch(req('costs.detachFile', { tripId: trip.id, expenseId: first.id, fileId }), user.id)).ok).toBe(true);

    const remaining = await rpc.dispatch(req('costs.listFiles', { tripId: trip.id, expenseId: second.id }), user.id);
    expect(remaining).toMatchObject({ ok: true });
    expect((remaining as { result: Array<{ id: number }> }).result.map((file) => file.id)).toEqual([fileId]);
    expect(testDb.prepare('SELECT COUNT(*) AS count FROM file_links').get()).toEqual({ count: 1 });
    expect(socketBroadcast).toHaveBeenCalledTimes(3);
    expect(socketBroadcast.mock.calls.every(([tripId, event]) => tripId === String(trip.id) && event === 'file:updated')).toBe(true);
  });

  it('refuses another trip, missing Costs grants, and denied app permissions', async () => {
    const { user: tripOwner } = createUser(testDb);
    const { user } = createUser(testDb);
    const { user: otherUser } = createUser(testDb);
    const trip = createTrip(testDb, tripOwner.id);
    addTripMember(testDb, trip.id, user.id);
    const otherTrip = createTrip(testDb, otherUser.id);
    const expense = createBudgetItem(testDb, trip.id);
    const otherExpense = createBudgetItem(testDb, otherTrip.id);
    const fileId = insertFile(trip.id, user.id, 'receipt.pdf');
    const rpc = host(ALL_GRANTS);

    const crossTrip = (await rpc.dispatch(
      req('costs.attachFile', { tripId: otherTrip.id, expenseId: otherExpense.id, fileId }),
      user.id,
    )) as RpcError;
    expect(crossTrip.error).toEqual({ code: 'RESOURCE_FORBIDDEN', message: `no access to trip ${otherTrip.id}` });

    const missingFiles = (await host(['db:read:files']).dispatch(
      req('costs.listFiles', { tripId: trip.id, expenseId: expense.id }),
      user.id,
    )) as RpcError;
    expect(missingFiles.error.code).toBe('PERMISSION_DENIED');

    testDb.prepare("INSERT OR REPLACE INTO app_settings (key, value) VALUES ('perm_budget_edit', 'trip_owner')").run();
    invalidatePermissionsCache();
    const deniedEdit = (await rpc.dispatch(
      req('costs.attachFile', { tripId: trip.id, expenseId: expense.id, fileId }),
      user.id,
    )) as RpcError;
    expect(deniedEdit.error).toEqual({ code: 'RESOURCE_FORBIDDEN', message: `no permission to edit costs on trip ${trip.id}` });
  });

  it('keeps trash behavior and the binary upload boundary intact', async () => {
    const { user } = createUser(testDb);
    const trip = createTrip(testDb, user.id);
    const expense = createBudgetItem(testDb, trip.id);
    const trashedId = insertFile(trip.id, user.id, 'trashed.pdf', '2026-08-31');
    const rpc = host(ALL_GRANTS);

    const refused = (await rpc.dispatch(
      req('costs.attachFile', { tripId: trip.id, expenseId: expense.id, fileId: trashedId }),
      user.id,
    )) as RpcError;
    expect(refused.error.code).toBe('RESOURCE_FORBIDDEN');

    testDb.prepare('UPDATE trip_files SET deleted_at = NULL WHERE id = ?').run(trashedId);
    expect((await rpc.dispatch(
      req('costs.attachFile', { tripId: trip.id, expenseId: expense.id, fileId: trashedId }),
      user.id,
    )).ok).toBe(true);
    testDb.prepare('UPDATE trip_files SET deleted_at = CURRENT_TIMESTAMP WHERE id = ?').run(trashedId);
    expect((await rpc.dispatch(
      req('costs.detachFile', { tripId: trip.id, expenseId: expense.id, fileId: trashedId }),
      user.id,
    )).ok).toBe(true);

    const uploaded = await rpc.dispatch(req('files.create', {
      tripId: trip.id,
      input: { name: 'uploaded.pdf', content_base64: Buffer.from('pdf').toString('base64') },
    }), user.id);
    expect(uploaded.ok).toBe(true);
    const uploadedId = (uploaded as { result: { id: number } }).result.id;
    expect((await rpc.dispatch(
      req('costs.attachFile', { tripId: trip.id, expenseId: expense.id, fileId: uploadedId }),
      user.id,
    )).ok).toBe(true);
    expect((await rpc.dispatch(
      req('costs.listFiles', { tripId: trip.id, expenseId: expense.id }),
      user.id,
    ) as { result: Array<{ id: number }> }).result.map((file) => file.id)).toEqual([uploadedId]);
  });
});
