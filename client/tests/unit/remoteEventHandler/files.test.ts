import { describe, it, expect, beforeEach } from 'vitest';
import { filesForExpense, linkedExpenseCount } from '../../../src/components/Budget/expenseAttachmentUtils';
import { createTripStore, useTripStore } from '../../../src/store/tripStore';
import { resetAllStores } from '../../helpers/store';
import { buildTripFile } from '../../helpers/factories';

beforeEach(() => {
  resetAllStores();
});

describe('remoteEventHandler > files', () => {
  const seedData = () => {
    useTripStore.setState({
      files: [buildTripFile({ id: 1, original_name: 'document.pdf' })],
    });
  };

  it('FE-WSEVT-FILE-001: file:created prepends new file to array', () => {
    seedData();
    const newFile = buildTripFile({ id: 99, original_name: 'photo.jpg' });
    useTripStore.getState().handleRemoteEvent({ type: 'file:created', file: newFile });
    const { files } = useTripStore.getState();
    expect(files).toHaveLength(2);
    expect(files[0].id).toBe(99); // prepended
  });

  it('FE-WSEVT-FILE-002: file:created is idempotent — no duplicate if same ID', () => {
    seedData();
    const duplicate = buildTripFile({ id: 1, original_name: 'document_dup.pdf' });
    useTripStore.getState().handleRemoteEvent({ type: 'file:created', file: duplicate });
    const { files } = useTripStore.getState();
    expect(files).toHaveLength(1);
    expect(files[0].original_name).toBe('document.pdf');
  });

  it('FE-WSEVT-FILE-003: file:updated replaces file in array', () => {
    seedData();
    const updated = buildTripFile({ id: 1, original_name: 'renamed.pdf' });
    useTripStore.getState().handleRemoteEvent({ type: 'file:updated', file: updated });
    const { files } = useTripStore.getState();
    expect(files[0].original_name).toBe('renamed.pdf');
  });

  it('FE-WSEVT-FILE-007: file:updated upserts authoritative relationships and stays idempotent out of order', () => {
    const updated = buildTripFile({
      id: 7,
      linked_budget_item_ids: [3, 3, 4, 3],
      expense_attachment_created_at: {
        '3': '2025-01-01T00:00:00.000Z',
        '4': '2025-01-02T00:00:00.000Z',
        '99': '2025-01-03T00:00:00.000Z',
      },
    });

    // An update can arrive before the create/restore frame. It is still a
    // complete File snapshot and must not disappear from the shared collection.
    useTripStore.getState().handleRemoteEvent({ type: 'file:updated', file: updated });
    expect(useTripStore.getState().files).toHaveLength(1);
    useTripStore.getState().handleRemoteEvent({ type: 'file:created', file: updated });

    const { files } = useTripStore.getState();
    expect(files).toHaveLength(1);
    expect(files[0].linked_budget_item_ids).toEqual([3, 4]);
    expect(files[0].expense_attachment_created_at).toEqual({
      '3': '2025-01-01T00:00:00.000Z',
      '4': '2025-01-02T00:00:00.000Z',
    });
  });

  it('FE-WSEVT-FILE-008: invalid file snapshots are ignored at the event boundary', () => {
    seedData();
    useTripStore.getState().handleRemoteEvent({ type: 'file:updated', file: { id: 99 } });

    expect(useTripStore.getState().files).toHaveLength(1);
    expect(useTripStore.getState().files[0].id).toBe(1);
  });

  it('FE-WSEVT-FILE-009: independent client stores converge through public file events', () => {
    const expenseId = 42;
    const clients = [createTripStore(), createTripStore()];
    const initial = buildTripFile({ id: 11 });
    const attached = {
      ...initial,
      linked_budget_item_ids: [expenseId, expenseId],
      expense_attachment_created_at: {
        [String(expenseId)]: '2025-01-01T00:00:00.000Z',
      },
    };

    for (const client of clients) {
      client.setState({ files: [initial] });
      client.getState().handleRemoteEvent({ type: 'file:updated', file: attached });
      expect(filesForExpense(client.getState().files, expenseId)).toHaveLength(1);
      expect(linkedExpenseCount(client.getState().files[0], [{ id: expenseId }])).toBe(1);
    }

    const detached = { ...attached, linked_budget_item_ids: [], expense_attachment_created_at: {} };
    for (const client of clients) {
      client.getState().handleRemoteEvent({ type: 'file:updated', file: detached });
      expect(filesForExpense(client.getState().files, expenseId)).toHaveLength(0);
      expect(linkedExpenseCount(client.getState().files[0], [{ id: expenseId }])).toBe(0);
      client.getState().handleRemoteEvent({ type: 'file:deleted', fileId: initial.id });
      expect(client.getState().files).toHaveLength(0);
      client.getState().handleRemoteEvent({ type: 'file:created', file: attached });
      expect(filesForExpense(client.getState().files, expenseId)).toHaveLength(1);
    }
  });

  it('FE-WSEVT-FILE-004: file:deleted removes file by ID', () => {
    seedData();
    useTripStore.getState().handleRemoteEvent({ type: 'file:deleted', fileId: 1 });
    const { files } = useTripStore.getState();
    expect(files).toHaveLength(0);
  });

  it('FE-WSEVT-FILE-006: file:updated leaves the other files untouched', () => {
    useTripStore.setState({
      files: [buildTripFile({ id: 1, original_name: 'a.pdf' }), buildTripFile({ id: 2, original_name: 'b.pdf' })],
    });
    useTripStore.getState().handleRemoteEvent({
      type: 'file:updated',
      file: buildTripFile({ id: 2, original_name: 'b-renamed.pdf' }),
    });
    expect(useTripStore.getState().files.map(f => f.original_name)).toEqual(['a.pdf', 'b-renamed.pdf']);
  });

  it('FE-WSEVT-FILE-005: file:created ordering — newest is first', () => {
    seedData();
    const f2 = buildTripFile({ id: 2, original_name: 'second.pdf' });
    const f3 = buildTripFile({ id: 3, original_name: 'third.pdf' });
    useTripStore.getState().handleRemoteEvent({ type: 'file:created', file: f2 });
    useTripStore.getState().handleRemoteEvent({ type: 'file:created', file: f3 });
    const { files } = useTripStore.getState();
    expect(files[0].id).toBe(3);
    expect(files[1].id).toBe(2);
    expect(files[2].id).toBe(1);
  });
});
