import { Injectable } from '@nestjs/common';
import type { TripFile, User } from '../../types';
import { DatabaseService, type TripAccess } from '../database/database.service';
import { FilesService } from '../files/files.service';
import { PermissionsService } from '../permissions/permissions.service';

/**
 * Owns the typed Expense <-> File relationship. Files remain independent
 * entities; this service only persists the pair and asks FilesService for the
 * authoritative enriched file representation after each change.
 */
@Injectable()
export class ExpenseAttachmentsService {
  constructor(
    private readonly db: DatabaseService,
    private readonly files: FilesService,
    private readonly permissions: PermissionsService,
  ) {}

  canMutate(trip: TripAccess, user: Pick<User, 'id' | 'role'>): boolean {
    const shared = trip.user_id !== user.id;
    return this.permissions.checkPermission('budget_edit', user.role, trip.user_id, user.id, shared)
      && this.permissions.checkPermission('file_edit', user.role, trip.user_id, user.id, shared);
  }

  /** Shared trip-access seam for non-HTTP adapters. */
  verifyTripAccess(tripId: string | number, userId: number): TripAccess | undefined {
    return this.db.canAccessTrip(tripId, userId);
  }

  /** Apply the same combined budget_edit + file_edit gate as the REST controller. */
  canMutateForUser(tripId: string | number, userId: number): boolean {
    const trip = this.verifyTripAccess(tripId, userId);
    if (!trip) return false;
    const user = this.db.get<{ id: number; role: User['role'] }>('SELECT id, role FROM users WHERE id = ?', userId);
    return user ? this.canMutate(trip, user) : false;
  }

  list(tripId: string | number, expenseId: string | number): TripFile[] | undefined {
    if (!this.findExpense(tripId, expenseId)) return undefined;
    // The trip Files collection is already batch-enriched with attachment
    // metadata. Filtering it here keeps this focused endpoint from introducing
    // one database request per attached file.
    return this.files.listFiles(tripId, false)
      .filter(file => file.linked_expense_ids?.includes(Number(expenseId)) ?? false);
  }

  attach(
    tripId: string | number,
    expenseId: string | number,
    fileId: string | number,
    socketId?: string,
  ): TripFile | undefined {
    if (!this.findExpense(tripId, expenseId) || !this.findFile(tripId, fileId, true)) return undefined;

    const inserted = this.db.transaction(() => {
      const result = this.db.run(
        'INSERT OR IGNORE INTO expense_attachments (expense_id, file_id) VALUES (?, ?)',
        Number(expenseId),
        Number(fileId),
      );
      return result.changes > 0;
    });

    const file = this.files.getFileResponse(fileId, tripId);
    if (!file) return undefined;
    if (inserted) this.files.broadcast(String(tripId), 'file:updated', { file }, socketId);
    return file;
  }

  detach(
    tripId: string | number,
    expenseId: string | number,
    fileId: string | number,
    socketId?: string,
  ): TripFile | undefined {
    if (!this.findExpense(tripId, expenseId) || !this.findFile(tripId, fileId, false)) return undefined;

    const deleted = this.db.transaction(() => {
      const result = this.db.run(
        'DELETE FROM expense_attachments WHERE expense_id = ? AND file_id = ?',
        Number(expenseId),
        Number(fileId),
      );
      return result.changes > 0;
    });

    const file = this.files.getFileResponse(fileId, tripId);
    if (!file) return undefined;
    if (deleted) this.files.broadcast(String(tripId), 'file:updated', { file }, socketId);
    return file;
  }

  private findExpense(tripId: string | number, expenseId: string | number): boolean {
    const id = Number(expenseId);
    return Number.isFinite(id)
      && !!this.db.get('SELECT id FROM budget_items WHERE id = ? AND trip_id = ?', id, tripId);
  }

  private findFile(tripId: string | number, fileId: string | number, liveOnly: boolean): boolean {
    const id = Number(fileId);
    if (!Number.isFinite(id)) return false;
    const liveClause = liveOnly ? ' AND deleted_at IS NULL' : '';
    return !!this.db.get(`SELECT id FROM trip_files WHERE id = ? AND trip_id = ?${liveClause}`, id, tripId);
  }
}
