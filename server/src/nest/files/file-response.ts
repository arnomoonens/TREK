import type { TripFile } from '../../types';
import { avatarUrl } from '../common/avatarUrl';
import type { DatabaseService } from '../database/database.service';

const FILE_SELECT = `
  SELECT f.*, r.title as reservation_title, u.username as uploaded_by_name, u.avatar as uploaded_by_avatar
  FROM trip_files f
  LEFT JOIN reservations r ON f.reservation_id = r.id
  LEFT JOIN users u ON f.uploaded_by = u.id
`;

interface FileLink {
  file_id: number;
  reservation_id: number | null;
  place_id: number | null;
  budget_item_id: number | null;
  created_at: string;
}

function formatFile(file: TripFile & { uploaded_by_avatar?: string | null }) {
  return {
    ...file,
    url: `/api/trips/${file.trip_id}/files/${file.id}/download`,
    uploaded_by_avatar: avatarUrl({ avatar: file.uploaded_by_avatar }),
  };
}

export function addFileRelationshipMetadata(db: DatabaseService, files: TripFile[]): TripFile[] {
  const fileIds = files.map((file) => file.id);
  if (fileIds.length === 0) return [];
  const placeholders = fileIds.map(() => '?').join(',');
  const links = db.all<FileLink>(
    `SELECT file_id, reservation_id, place_id, budget_item_id, created_at
     FROM file_links
     WHERE file_id IN (${placeholders})
     ORDER BY created_at ASC, id ASC`,
    ...fileIds,
  );
  const linksByFile = new Map<number, FileLink[]>();
  for (const link of links) {
    const rows = linksByFile.get(link.file_id) ?? [];
    rows.push(link);
    linksByFile.set(link.file_id, rows);
  }

  return files.map((file) => {
    const fileLinks = linksByFile.get(file.id) ?? [];
    const expenseLinks = fileLinks.filter((link) => link.budget_item_id !== null);
    return {
      ...formatFile(file),
      linked_reservation_ids: fileLinks.filter((link) => link.reservation_id).map((link) => link.reservation_id),
      linked_place_ids: fileLinks.filter((link) => link.place_id).map((link) => link.place_id),
      linked_budget_item_ids: expenseLinks.map((link) => link.budget_item_id!),
      expense_attachment_created_at: Object.fromEntries(
        expenseLinks.map((link) => [String(link.budget_item_id), link.created_at]),
      ),
    };
  });
}

/** Build canonical enriched file responses for any trip-scoped read or event. */
export function getFileResponses(
  db: DatabaseService,
  ids: readonly (string | number)[],
  tripId: string | number,
): TripFile[] {
  const fileIds = [...new Set(ids.map(Number))];
  if (fileIds.length === 0) return [];
  const placeholders = fileIds.map(() => '?').join(',');
  const files = db.all<TripFile>(
    `${FILE_SELECT} WHERE f.trip_id = ? AND f.id IN (${placeholders})`,
    tripId,
    ...fileIds,
  );
  return addFileRelationshipMetadata(db, files);
}
