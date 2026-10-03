import { PluginController, PluginMethod } from '../plugins/host/rpc-kit/decorators';
import { PluginGuards } from '../plugins/host/plugin-guards.service';
import { ForbiddenResource } from '../plugins/host/rpc-errors';
import { num } from '../plugins/host/rpc-params';
import type { PluginRpcContext } from '../plugins/host/rpc-kit/types';
import { ADDON_IDS } from '../../addons';
import { ExpenseAttachmentsService } from './expense-attachments.service';

/** Plugin Costs methods for the existing Expense ↔ File relationship. */
@PluginController()
export class ExpenseAttachmentsRpc {
  constructor(
    private readonly attachments: ExpenseAttachmentsService,
    private readonly guards: PluginGuards,
  ) {}

  @PluginMethod('costs.listFiles', {
    permission: 'db:read:costs',
  })
  listFiles(params: Record<string, unknown>, ctx: PluginRpcContext): unknown {
    return this.guards.tripRead(params, ctx, () => {
      const tripId = num(params.tripId, 'tripId');
      const expenseId = num(params.expenseId, 'expenseId');
      this.guards.requireAddon(ADDON_IDS.BUDGET, 'costs');
      const files = this.attachments.list(tripId, expenseId);
      if (!files) throw new ForbiddenResource(`no expense ${expenseId} on trip ${tripId}`);
      return files;
    });
  }

  @PluginMethod('costs.attachFile', {
    permission: 'db:write:costs',
  })
  attachFile(params: Record<string, unknown>, ctx: PluginRpcContext): unknown {
    return this.mutate(params, ctx, (tripId, expenseId, fileId) =>
      this.attachments.attach(tripId, expenseId, fileId));
  }

  @PluginMethod('costs.detachFile', {
    permission: 'db:write:costs',
  })
  detachFile(params: Record<string, unknown>, ctx: PluginRpcContext): unknown {
    return this.mutate(params, ctx, (tripId, expenseId, fileId) =>
      this.attachments.detach(tripId, expenseId, fileId));
  }

  private mutate(
    params: Record<string, unknown>,
    ctx: PluginRpcContext,
    operation: (tripId: number, expenseId: number, fileId: number) => unknown,
  ): unknown {
    const tripId = num(params.tripId, 'tripId');
    const expenseId = num(params.expenseId, 'expenseId');
    const fileId = num(params.fileId, 'fileId');
    const actor = this.guards.requireActor(ctx, 'cost');
    this.guards.requireAddon(ADDON_IDS.BUDGET, 'costs');
    if (!this.attachments.verifyTripAccess(tripId, actor)) {
      throw new ForbiddenResource(`no access to trip ${tripId}`);
    }
    if (!this.attachments.canMutateForUser(tripId, actor)) {
      throw new ForbiddenResource(`no permission to edit costs on trip ${tripId}`);
    }
    const file = operation(tripId, expenseId, fileId);
    if (!file) throw new ForbiddenResource(`no expense ${expenseId} or file ${fileId} on trip ${tripId}`);
    return file;
  }
}
