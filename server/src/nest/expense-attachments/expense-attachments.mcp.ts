import { z } from 'zod';
import {
  McpController,
  Tool,
  type McpContext,
  type McpTextResult,
  TOOL_ANNOTATIONS_DELETE,
  TOOL_ANNOTATIONS_READONLY,
  TOOL_ANNOTATIONS_WRITE,
  demoDenied,
  errorResult,
  ok,
} from '../../nest-mcp';
import { canRead, canWrite } from '../../mcp/scopes';
import { noAccess, permissionDenied } from '../../mcp/tools/_shared';
import { ADDON_IDS } from '../../addons';
import { addonGate } from '../addons/addon-gate';
import { AddonsService } from '../addons/addons.service';
import { DatabaseService } from '../database/database.service';
import { isDemoUserId } from '../common/demo-write';
import { RuntimeEnvService } from '../app-config/runtime-env.service';
import { ExpenseAttachmentsService } from './expense-attachments.service';

const budgetAddonOn = addonGate(ADDON_IDS.BUDGET);

const canReadExpenseFiles = (ctx: McpContext): boolean =>
  canRead(ctx.scopes, 'budget');

const canWriteExpenseFiles = (ctx: McpContext): boolean =>
  canWrite(ctx.scopes, 'budget');

/** MCP's focused Costs ↔ Files relationship surface. */
@McpController()
export class ExpenseAttachmentsMcp {
  constructor(
    private readonly attachments: ExpenseAttachmentsService,
    private readonly db: DatabaseService,
    private readonly env: RuntimeEnvService,
    readonly addons: AddonsService,
  ) {}

  @Tool({
    name: 'list_expense_files',
    description: 'List the live Files attached to one Expense. The File IDs returned here can be used with attach_expense_file and detach_expense_file. A File can be attached to more than one Expense.',
    inputSchema: {
      tripId: z.number().int().positive(),
      expenseId: z.number().int().positive(),
    },
    annotations: TOOL_ANNOTATIONS_READONLY,
    when: budgetAddonOn,
    access: canReadExpenseFiles,
  })
  listExpenseFiles({ tripId, expenseId }: { tripId: number; expenseId: number }, ctx: McpContext) {
    if (!this.attachments.verifyTripAccess(tripId, ctx.userId)) return noAccess();
    const files = this.attachments.list(tripId, expenseId);
    if (!files) return errorResult('Expense or file not found.');
    return ok({ files });
  }

  @Tool({
    name: 'attach_expense_file',
    description: 'Attach one existing live File on this trip to an Expense. Upload the File first through the Files surface; this operation only creates the Expense relationship and is idempotent.',
    inputSchema: {
      tripId: z.number().int().positive(),
      expenseId: z.number().int().positive(),
      fileId: z.number().int().positive(),
    },
    annotations: TOOL_ANNOTATIONS_WRITE,
    when: budgetAddonOn,
    access: canWriteExpenseFiles,
  })
  attachExpenseFile(
    { tripId, expenseId, fileId }: { tripId: number; expenseId: number; fileId: number },
    ctx: McpContext,
  ) {
    if (this.isDemoUser(ctx.userId)) return demoDenied();
    const denied = this.mutationDenied(tripId, ctx.userId);
    if (denied) return denied;
    const file = this.attachments.attach(tripId, expenseId, fileId);
    if (!file) return errorResult('Expense or file not found.');
    return ok({ file });
  }

  @Tool({
    name: 'detach_expense_file',
    description: 'Detach one existing File from an Expense. The File remains on the trip and can stay attached to other Expenses; repeating this operation is safe.',
    inputSchema: {
      tripId: z.number().int().positive(),
      expenseId: z.number().int().positive(),
      fileId: z.number().int().positive(),
    },
    annotations: TOOL_ANNOTATIONS_DELETE,
    when: budgetAddonOn,
    access: canWriteExpenseFiles,
  })
  detachExpenseFile(
    { tripId, expenseId, fileId }: { tripId: number; expenseId: number; fileId: number },
    ctx: McpContext,
  ) {
    if (this.isDemoUser(ctx.userId)) return demoDenied();
    const denied = this.mutationDenied(tripId, ctx.userId);
    if (denied) return denied;
    const file = this.attachments.detach(tripId, expenseId, fileId);
    if (!file) return errorResult('Expense or file not found.');
    return ok({ success: true, file });
  }

  private isDemoUser(userId: number): boolean {
    return isDemoUserId(this.env, this.db, userId);
  }

  private mutationDenied(tripId: number, userId: number): McpTextResult | undefined {
    if (!this.attachments.verifyTripAccess(tripId, userId)) return noAccess();
    if (!this.attachments.canMutateForUser(tripId, userId)) return permissionDenied();
    return undefined;
  }
}
