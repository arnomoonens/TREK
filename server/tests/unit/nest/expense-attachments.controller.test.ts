import { describe, expect, it, vi } from 'vitest';
import { HttpException } from '@nestjs/common';
import { ExpenseAttachmentsController } from '../../../src/nest/expense-attachments/expense-attachments.controller';
import type { ExpenseAttachmentsService } from '../../../src/nest/expense-attachments/expense-attachments.service';
import type { TripAccess } from '../../../src/nest/database/database.service';
import type { TripFile, User } from '../../../src/types';

const trip = { id: 5, user_id: 42 } as TripAccess;
const user = { id: 7, role: 'user' } as User;
const file = { id: 8, trip_id: 5, original_name: 'receipt.pdf' } as TripFile;

function makeController(overrides: Partial<Record<keyof ExpenseAttachmentsService, ReturnType<typeof vi.fn>>> = {}) {
  const service = {
    list: vi.fn(),
    canMutate: vi.fn(() => true),
    canEditFiles: vi.fn(() => false),
    attach: vi.fn(),
    detach: vi.fn(),
    ...overrides,
  } as unknown as ExpenseAttachmentsService;
  return { controller: new ExpenseAttachmentsController(service), service };
}

function thrown(run: () => unknown): { status: number; body: unknown } {
  try {
    run();
  } catch (error) {
    expect(error).toBeInstanceOf(HttpException);
    const exception = error as HttpException;
    return { status: exception.getStatus(), body: exception.getResponse() };
  }
  throw new Error('expected the handler to throw');
}

describe('ExpenseAttachmentsController', () => {
  it('lists attached files under the expense budget route', () => {
    const { controller, service } = makeController({ list: vi.fn(() => [file]) });

    expect(controller.list('5', '12')).toEqual({ files: [file] });
    expect(service.list).toHaveBeenCalledWith('5', '12');
  });

  it('maps an unknown expense or file to the shared 404 response', () => {
    const { controller } = makeController({ list: vi.fn(() => undefined) });

    expect(thrown(() => controller.list('5', '404'))).toEqual({
      status: 404,
      body: { error: 'Expense or file not found' },
    });
  });

  it('requires an existing Costs or Files edit permission before attaching', () => {
    const { controller, service } = makeController({ canMutate: vi.fn(() => false) });

    expect(thrown(() => controller.attach(user, trip, '5', '12', '8'))).toEqual({
      status: 403,
      body: { error: 'No permission' },
    });
    expect(service.attach).not.toHaveBeenCalled();
  });

  it('allows the Files edit permission without the Costs edit permission', () => {
    const { controller, service } = makeController({
      canMutate: vi.fn(() => false), canEditFiles: vi.fn(() => true), attach: vi.fn(() => file),
    });
    expect(controller.attach(user, trip, '5', '12', '8')).toEqual({ file });
    expect(service.attach).toHaveBeenCalledWith('5', '12', '8', undefined);
  });

  it('forwards the socket id and returns the attached file', () => {
    const { controller, service } = makeController({ attach: vi.fn(() => file) });

    expect(controller.attach(user, trip, '5', '12', '8', 'socket-1')).toEqual({ file });
    expect(service.attach).toHaveBeenCalledWith('5', '12', '8', 'socket-1');
  });

  it('returns the detached file and success marker', () => {
    const { controller, service } = makeController({ detach: vi.fn(() => file) });

    expect(controller.detach(user, trip, '5', '12', '8', 'socket-2')).toEqual({ success: true, file });
    expect(service.detach).toHaveBeenCalledWith('5', '12', '8', 'socket-2');
  });
});
