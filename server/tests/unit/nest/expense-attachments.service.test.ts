import { describe, expect, it, vi } from 'vitest';
import { ExpenseAttachmentsService } from '../../../src/nest/expense-attachments/expense-attachments.service';
import type { DatabaseService, TripAccess } from '../../../src/nest/database/database.service';
import type { FilesService } from '../../../src/nest/files/files.service';
import type { PermissionsService } from '../../../src/nest/permissions/permissions.service';
import type { TripFile, User } from '../../../src/types';

const trip = { id: 5, user_id: 42 } as TripAccess;
const user = { id: 7, role: 'user' } as User;
const file = { id: 8, trip_id: 5, original_name: 'receipt.pdf', linked_expense_ids: [12] } as TripFile;

function makeService() {
  const db = {
    get: vi.fn(() => ({ id: 12 })),
    all: vi.fn(),
    run: vi.fn(() => ({ changes: 1 })),
    transaction: vi.fn(<T>(work: () => T) => work()),
  };
  const files = {
    listFiles: vi.fn(() => [file]),
    getFileResponse: vi.fn(() => file),
    broadcast: vi.fn(),
  };
  const permissions = { checkPermission: vi.fn(() => true) };
  return {
    service: new ExpenseAttachmentsService(
      db as unknown as DatabaseService,
      files as unknown as FilesService,
      permissions as unknown as PermissionsService,
    ),
    db,
    files,
    permissions,
  };
}

describe('ExpenseAttachmentsService', () => {
  it('requires both budget and file permissions', () => {
    const { service, permissions } = makeService();

    expect(service.canMutate(trip, user)).toBe(true);
    expect(permissions.checkPermission).toHaveBeenNthCalledWith(1, 'budget_edit', 'user', 42, 7, true);
    expect(permissions.checkPermission).toHaveBeenNthCalledWith(2, 'file_edit', 'user', 42, 7, true);
  });

  it('lists attached live Files from the batch-enriched trip collection', () => {
    const { service, files } = makeService();

    expect(service.list(5, 12)).toEqual([file]);
    expect(files.listFiles).toHaveBeenCalledWith(5, false);
  });

  it('broadcasts a newly attached pair through the File boundary', () => {
    const { service, db, files } = makeService();

    expect(service.attach(5, 12, 8, 'socket-1')).toBe(file);
    expect(db.run).toHaveBeenCalledWith(
      'INSERT OR IGNORE INTO expense_attachments (expense_id, file_id) VALUES (?, ?)',
      12,
      8,
    );
    expect(files.broadcast).toHaveBeenCalledWith('5', 'file:updated', { file }, 'socket-1');
  });

  it('treats a duplicate detach as success without broadcasting', () => {
    const { service, db, files } = makeService();
    db.run.mockReturnValue({ changes: 0 });

    expect(service.detach(5, 12, 8)).toBe(file);
    expect(files.broadcast).not.toHaveBeenCalled();
  });
});
