/**
 * Public MCP coverage for the focused Expense ↔ File operations. The suite uses
 * the same in-memory server/client harness as real MCP callers, so registration
 * scopes, domain authorization, relationship idempotency and realtime side
 * effects all cross the transport boundary.
 */
import { describe, it, expect, vi, beforeAll, beforeEach, afterAll } from 'vitest';

const { testDb, dbMock } = vi.hoisted(() => {
  const Database = require('better-sqlite3');
  const db = new Database(':memory:');
  db.exec('PRAGMA journal_mode = WAL');
  db.exec('PRAGMA foreign_keys = ON');
  db.exec('PRAGMA busy_timeout = 5000');
  const mock = {
    db,
    closeDb: () => {},
    reinitialize: () => {},
    getPlaceWithTags: () => null,
    canAccessTrip: (tripId: any, userId: number) =>
      db.prepare(`
        SELECT t.id, t.user_id FROM trips t
        LEFT JOIN trip_members m ON m.trip_id = t.id AND m.user_id = ?
        WHERE t.id = ? AND (t.user_id = ? OR m.user_id IS NOT NULL)
      `).get(userId, tripId, userId),
    isOwner: (tripId: any, userId: number) =>
      !!db.prepare('SELECT id FROM trips WHERE id = ? AND user_id = ?').get(tripId, userId),
  };
  return { testDb: db, dbMock: mock };
});

vi.mock('../../../src/db/database', () => dbMock);
vi.mock('../../../src/config', () => ({
  JWT_SECRET: 'test-jwt-secret-for-trek-testing-only',
  ENCRYPTION_KEY: 'a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6a7b8c9d0e1f2a3b4c5d6a7b8c9d0e1f2',
  updateJwtSecret: () => {},
}));

const { broadcastMock } = vi.hoisted(() => ({ broadcastMock: vi.fn() }));
vi.mock('../../../src/websocket', () => ({ broadcast: broadcastMock }));

import { createTables } from '../../../src/db/schema';
import { runMigrations } from '../../../src/db/migrations';
import { resetTestDb, setAddonEnabled } from '../../helpers/test-db';
import { invalidatePermissionsCache } from '../../../src/nest/permissions/permissions-cache';
import { addTripMember, createBudgetItem, createTrip, createUser } from '../../helpers/factories';
import { createMcpHarness, parseToolResult, type McpHarness } from '../../helpers/mcp-harness';
import { expectRegisteredProvider } from '../../helpers/module-providers';
import { ExpenseAttachmentsMcp } from '../../../src/nest/expense-attachments/expense-attachments.mcp';
import { ExpenseAttachmentsModule } from '../../../src/nest/expense-attachments/expense-attachments.module';

beforeAll(() => {
  createTables(testDb);
  runMigrations(testDb);
});

beforeEach(() => {
  resetTestDb(testDb);
  setAddonEnabled(testDb, 'budget', true);
  broadcastMock.mockClear();
  delete process.env.DEMO_MODE;
  invalidatePermissionsCache();
});

afterAll(() => testDb.close());

async function withHarness(
  userId: number,
  scopes: string[] | null = null,
  fn: (h: McpHarness) => Promise<void>,
) {
  const h = await createMcpHarness({ userId, scopes, withResources: false });
  try { await fn(h); } finally { await h.cleanup(); }
}

function setPermission(action: string, level: string) {
  testDb.prepare('INSERT OR REPLACE INTO app_settings (key, value) VALUES (?, ?)').run(`perm_${action}`, level);
  invalidatePermissionsCache();
}

function insertFile(tripId: number, deletedAt: string | null = null) {
  const result = testDb.prepare(`
    INSERT INTO trip_files (trip_id, filename, original_name, file_size, mime_type, uploaded_by, deleted_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(tripId, `stored-${tripId}-${Date.now()}.pdf`, 'receipt.pdf', 12, 'application/pdf', null, deletedAt);
  return Number(result.lastInsertRowid);
}

function attachRow(expenseId: number, fileId: number) {
  testDb.prepare('INSERT INTO expense_attachments (expense_id, file_id) VALUES (?, ?)').run(expenseId, fileId);
}

function relationshipCount(expenseId: number, fileId: number): number {
  return (testDb.prepare(
    'SELECT COUNT(*) AS count FROM expense_attachments WHERE expense_id = ? AND file_id = ?',
  ).get(expenseId, fileId) as { count: number }).count;
}

describe('Expense attachment MCP discovery', () => {
  it('registers the focused tools behind both existing scopes and no upload tool', async () => {
    const { user } = createUser(testDb);

    await withHarness(user.id, null, async (h) => {
      const names = (await h.client.listTools()).tools.map((tool) => tool.name);
      expect(names).toEqual(expect.arrayContaining([
        'list_expense_files', 'attach_expense_file', 'detach_expense_file',
      ]));
      expect(names).not.toContain('upload_expense_file');
    });

    await withHarness(user.id, ['budget:read'], async (h) => {
      const names = (await h.client.listTools()).tools.map((tool) => tool.name);
      expect(names).not.toEqual(expect.arrayContaining([
        'list_expense_files', 'attach_expense_file', 'detach_expense_file',
      ]));
    });

    await withHarness(user.id, ['budget:read', 'files:read'], async (h) => {
      const names = (await h.client.listTools()).tools.map((tool) => tool.name);
      expect(names).toEqual(expect.arrayContaining(['list_expense_files']));
      expect(names).not.toEqual(expect.arrayContaining(['attach_expense_file', 'detach_expense_file']));
    });
  });

  it('is registered by the ExpenseAttachments module', () => {
    expectRegisteredProvider(ExpenseAttachmentsModule, ExpenseAttachmentsMcp);
  });
});

describe('Tool: list_expense_files', () => {
  it('lists live attached Files, excludes trash, and supports a File reused by two Expenses', async () => {
    const { user } = createUser(testDb);
    const trip = createTrip(testDb, user.id);
    const first = createBudgetItem(testDb, trip.id);
    const second = createBudgetItem(testDb, trip.id);
    const liveFile = insertFile(trip.id);
    const trashedFile = insertFile(trip.id, '2026-08-31 10:00:00');
    attachRow(first.id, liveFile);
    attachRow(first.id, trashedFile);

    await withHarness(user.id, null, async (h) => {
      const firstResult = parseToolResult(await h.client.callTool({
        name: 'list_expense_files', arguments: { tripId: trip.id, expenseId: first.id },
      })) as { files: Array<{ id: number }> };
      expect(firstResult.files.map((file) => file.id)).toEqual([liveFile]);

      const attachResult = await h.client.callTool({
        name: 'attach_expense_file', arguments: { tripId: trip.id, expenseId: second.id, fileId: liveFile },
      });
      expect(attachResult.isError).not.toBe(true);

      const secondResult = parseToolResult(await h.client.callTool({
        name: 'list_expense_files', arguments: { tripId: trip.id, expenseId: second.id },
      })) as { files: Array<{ id: number }> };
      expect(secondResult.files.map((file) => file.id)).toEqual([liveFile]);
    });
  });
});

describe('Tools: attach_expense_file and detach_expense_file', () => {
  it('mutates idempotently and broadcasts only on relationship changes', async () => {
    const { user } = createUser(testDb);
    const trip = createTrip(testDb, user.id);
    const expense = createBudgetItem(testDb, trip.id);
    const fileId = insertFile(trip.id);

    await withHarness(user.id, null, async (h) => {
      const args = { tripId: trip.id, expenseId: expense.id, fileId };
      expect((await h.client.callTool({ name: 'attach_expense_file', arguments: args })).isError).not.toBe(true);
      expect((await h.client.callTool({ name: 'attach_expense_file', arguments: args })).isError).not.toBe(true);
      expect(relationshipCount(expense.id, fileId)).toBe(1);
      expect(broadcastMock).toHaveBeenCalledTimes(1);

      expect((await h.client.callTool({ name: 'detach_expense_file', arguments: args })).isError).not.toBe(true);
      expect((await h.client.callTool({ name: 'detach_expense_file', arguments: args })).isError).not.toBe(true);
      expect(relationshipCount(expense.id, fileId)).toBe(0);
      expect(broadcastMock).toHaveBeenCalledTimes(2);
      expect(broadcastMock.mock.calls.map((call) => call[1])).toEqual(['file:updated', 'file:updated']);
    });
  });

  it('refuses cross-trip identities and both user permission failures', async () => {
    const { user } = createUser(testDb);
    const firstTrip = createTrip(testDb, user.id);
    const secondTrip = createTrip(testDb, user.id);
    const firstExpense = createBudgetItem(testDb, firstTrip.id);
    const foreignFile = insertFile(secondTrip.id);

    await withHarness(user.id, null, async (h) => {
      const crossTrip = await h.client.callTool({
        name: 'attach_expense_file',
        arguments: { tripId: firstTrip.id, expenseId: firstExpense.id, fileId: foreignFile },
      });
      expect(crossTrip.isError).toBe(true);
      expect(relationshipCount(firstExpense.id, foreignFile)).toBe(0);
    });

    const { user: member } = createUser(testDb);
    addTripMember(testDb, firstTrip.id, member.id);
    const memberFile = insertFile(firstTrip.id);

    setPermission('budget_edit', 'trip_owner');
    await withHarness(member.id, null, async (h) => {
      const budgetDenied = await h.client.callTool({
        name: 'attach_expense_file',
        arguments: { tripId: firstTrip.id, expenseId: firstExpense.id, fileId: memberFile },
      });
      expect(budgetDenied.isError).toBe(true);
      expect(relationshipCount(firstExpense.id, memberFile)).toBe(0);
    });

    setPermission('budget_edit', 'trip_member');
    setPermission('file_edit', 'trip_owner');
    await withHarness(member.id, null, async (h) => {
      const fileDenied = await h.client.callTool({
        name: 'attach_expense_file',
        arguments: { tripId: firstTrip.id, expenseId: firstExpense.id, fileId: memberFile },
      });
      expect(fileDenied.isError).toBe(true);
      expect(relationshipCount(firstExpense.id, memberFile)).toBe(0);
    });
  });

  it('refuses attaching a trashed File while detaching remains available', async () => {
    const { user } = createUser(testDb);
    const trip = createTrip(testDb, user.id);
    const expense = createBudgetItem(testDb, trip.id);
    const trashedFile = insertFile(trip.id, '2026-08-31 10:00:00');

    await withHarness(user.id, null, async (h) => {
      const attach = await h.client.callTool({
        name: 'attach_expense_file',
        arguments: { tripId: trip.id, expenseId: expense.id, fileId: trashedFile },
      });
      expect(attach.isError).toBe(true);
      expect(relationshipCount(expense.id, trashedFile)).toBe(0);

      testDb.prepare('UPDATE trip_files SET deleted_at = NULL WHERE id = ?').run(trashedFile);
      expect((await h.client.callTool({
        name: 'attach_expense_file',
        arguments: { tripId: trip.id, expenseId: expense.id, fileId: trashedFile },
      })).isError).not.toBe(true);
      testDb.prepare('UPDATE trip_files SET deleted_at = ? WHERE id = ?').run('2026-08-31 10:00:00', trashedFile);

      const detach = await h.client.callTool({
        name: 'detach_expense_file',
        arguments: { tripId: trip.id, expenseId: expense.id, fileId: trashedFile },
      });
      expect(detach.isError).not.toBe(true);
      expect(relationshipCount(expense.id, trashedFile)).toBe(0);
    });
  });
});
