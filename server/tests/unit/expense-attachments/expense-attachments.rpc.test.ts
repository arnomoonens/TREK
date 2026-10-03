import { describe, it, expect, vi } from 'vitest';
import { PluginRpcHost } from '../../../src/nest/plugins/host/rpc-host';
import { createTestPluginRegistry } from '../../../src/nest/plugins/host/rpc-kit/testing';
import { PluginGuards } from '../../../src/nest/plugins/host/plugin-guards.service';
import { ExpenseAttachmentsRpc } from '../../../src/nest/expense-attachments/expense-attachments.rpc';
import { ExpenseAttachmentsModule } from '../../../src/nest/expense-attachments/expense-attachments.module';
import type { ExpenseAttachmentsService } from '../../../src/nest/expense-attachments/expense-attachments.service';
import type { DatabaseService } from '../../../src/nest/database/database.service';
import type { PermissionsService } from '../../../src/nest/permissions/permissions.service';
import type { AddonsService } from '../../../src/nest/addons/addons.service';
import type { RpcError, RpcRequest } from '../../../src/nest/plugins/protocol/envelope';
import { makeDeps } from '../../helpers/rpc-host-deps';
import { expectRegisteredProvider } from '../../helpers/module-providers';

const req = (method: string, params: Record<string, unknown>): RpcRequest => ({ k: 'req', id: 'x', method, params });

function build(opts: { access?: boolean; canMutate?: boolean; addonOn?: boolean } = {}) {
  const file = { id: 8, trip_id: 1, original_name: 'receipt.pdf' };
  const attachments = {
    verifyTripAccess: vi.fn(() => opts.access === false ? undefined : { id: 1, user_id: 42 }),
    canMutateForUser: vi.fn(() => opts.canMutate !== false),
    list: vi.fn(() => [file]),
    attach: vi.fn(() => file),
    detach: vi.fn(() => file),
  } as unknown as ExpenseAttachmentsService & Record<string, ReturnType<typeof vi.fn>>;
  const db = {
    canAccessTrip: vi.fn(() => opts.access === false ? undefined : { id: 1, user_id: 42 }),
    prepare: vi.fn(() => ({ get: () => ({ role: 'user' }) })),
  } as unknown as DatabaseService;
  const guards = new PluginGuards(
    db,
    { checkPermission: vi.fn(() => true) } as unknown as PermissionsService,
    { isAddonEnabled: vi.fn(() => opts.addonOn !== false) } as unknown as AddonsService,
  );
  const rpc = new ExpenseAttachmentsRpc(attachments, guards);
  const host = (...grants: string[]) => new PluginRpcHost(
    'p',
    new Set(grants),
    makeDeps(),
    createTestPluginRegistry([rpc]),
  );
  return { attachments, host };
}

const READ_GRANTS = ['db:read:costs'];
const WRITE_GRANTS = ['db:write:costs'];

describe('ExpenseAttachmentsRpc', () => {
  it('lists through the shared attachment service after trip and addon checks', async () => {
    const f = build();
    const response = await f.host(...READ_GRANTS).dispatch(
      req('costs.listFiles', { tripId: 1, expenseId: 12 }),
      42,
    );
    expect(response.ok).toBe(true);
    expect((response as { result: unknown }).result).toEqual([{ id: 8, trip_id: 1, original_name: 'receipt.pdf' }]);
    expect(f.attachments.list).toHaveBeenCalledWith(1, 12);
  });

  it('requires the Costs read grant before binding the list method', async () => {
    const f = build();
    for (const grants of [['db:read:files'], []]) {
      const response = (await f.host(...grants).dispatch(
        req('costs.listFiles', { tripId: 1, expenseId: 12 }),
        42,
      )) as RpcError;
      expect(response.error.code).toBe('PERMISSION_DENIED');
      expect(response.error.message).toContain('db:read:costs');
    }
    expect(f.attachments.list).not.toHaveBeenCalled();
  });

  it('requires the Costs write grant and delegates attach and detach', async () => {
    const f = build();
    for (const grants of [['db:write:files'], []]) {
      const response = (await f.host(...grants).dispatch(
        req('costs.attachFile', { tripId: 1, expenseId: 12, fileId: 8 }),
        42,
      )) as RpcError;
      expect(response.error.code).toBe('PERMISSION_DENIED');
    }

    expect((await f.host(...WRITE_GRANTS).dispatch(
      req('costs.attachFile', { tripId: 1, expenseId: 12, fileId: 8 }), 42,
    )).ok).toBe(true);
    expect((await f.host(...WRITE_GRANTS).dispatch(
      req('costs.detachFile', { tripId: 1, expenseId: 12, fileId: 8 }), 42,
    )).ok).toBe(true);
    expect(f.attachments.attach).toHaveBeenCalledWith(1, 12, 8);
    expect(f.attachments.detach).toHaveBeenCalledWith(1, 12, 8);
  });

  it('refuses an inaccessible trip or a user without the Costs edit right', async () => {
    const inaccessible = build({ access: false });
    const deniedTrip = (await inaccessible.host(...WRITE_GRANTS).dispatch(
      req('costs.attachFile', { tripId: 9, expenseId: 12, fileId: 8 }), 42,
    )) as RpcError;
    expect(deniedTrip.error).toEqual({ code: 'RESOURCE_FORBIDDEN', message: 'no access to trip 9' });
    expect(inaccessible.attachments.attach).not.toHaveBeenCalled();

    const noPermission = build({ canMutate: false });
    const deniedEdit = (await noPermission.host(...WRITE_GRANTS).dispatch(
      req('costs.detachFile', { tripId: 1, expenseId: 12, fileId: 8 }), 42,
    )) as RpcError;
    expect(deniedEdit.error).toEqual({ code: 'RESOURCE_FORBIDDEN', message: 'no permission to edit costs on trip 1' });
    expect(noPermission.attachments.detach).not.toHaveBeenCalled();
  });

  it('reports disabled Costs before calling a relationship operation', async () => {
    const f = build({ addonOn: false });
    const response = (await f.host(...READ_GRANTS).dispatch(
      req('costs.listFiles', { tripId: 1, expenseId: 12 }), 42,
    )) as RpcError;
    expect(response.error).toEqual({ code: 'RESOURCE_FORBIDDEN', message: 'the costs addon is disabled' });
    expect(f.attachments.list).not.toHaveBeenCalled();
  });

  it('is registered in the ExpenseAttachments module', () => {
    expectRegisteredProvider(ExpenseAttachmentsModule, ExpenseAttachmentsRpc);
  });
});
