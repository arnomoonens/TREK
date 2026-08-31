import { describe, it, expect } from 'vitest';
import { createMockHost } from '../src/mock-host.js';

const grants = [
  'db:read:costs', 'db:read:files', 'db:write:costs', 'db:write:files', 'file_upload',
];

describe('plugin SDK Expense attachment surface', () => {
  it('lists, reuses, attaches and detaches existing Files idempotently', async () => {
    const host = createMockHost({
      grants,
      actingUserId: 42,
      trips: {
        1: {
          members: [42],
          costs: [{ id: 9 }, { id: 10 }],
          files: [{ id: 3, name: 'receipt.pdf' }, { id: 4, name: 'trash.pdf', deleted_at: '2026-08-31' }],
        },
      },
    });

    expect(await host.ctx.costs.listFiles(1, 9)).toEqual([]);
    const file = await host.ctx.costs.attachFile(1, 9, 3);
    const firstStamp = (file.expense_attachment_created_at as Record<string, string>)['9'];
    await host.ctx.costs.attachFile(1, 9, 3);
    await host.ctx.costs.attachFile(1, 10, 3);
    expect(await host.ctx.costs.listFiles(1, 9)).toEqual([file]);
    expect(await host.ctx.costs.listFiles(1, 10)).toEqual([file]);
    expect((file.expense_attachment_created_at as Record<string, string>)['9']).toBe(firstStamp);
    expect((file.expense_attachment_created_at as Record<string, string>)['10']).toEqual(expect.any(String));

    await expect(host.ctx.costs.attachFile(1, 9, 4)).rejects.toThrow(/RESOURCE_FORBIDDEN/);
    await host.ctx.costs.detachFile(1, 9, 3);
    await host.ctx.costs.detachFile(1, 9, 3);
    expect(await host.ctx.costs.listFiles(1, 9)).toEqual([]);
    expect(await host.ctx.costs.listFiles(1, 10)).toEqual([file]);
  });

  it('requires both capability grants, trip access, and app edit rights', async () => {
    const fixture = { actingUserId: 42, trips: { 1: { members: [42], costs: [{ id: 9 }], files: [{ id: 3 }] } } };
    await expect(createMockHost({ ...fixture, grants: ['db:read:costs'] }).ctx.costs.listFiles(1, 9))
      .rejects.toThrow(/PERMISSION_DENIED/);
    await expect(createMockHost({ ...fixture, grants: ['db:read:files'] }).ctx.costs.listFiles(1, 9))
      .rejects.toThrow(/PERMISSION_DENIED/);
    await expect(createMockHost({ ...fixture, grants: ['db:write:costs', 'db:write:files'], actingUserId: 99 }).ctx.costs.attachFile(1, 9, 3))
      .rejects.toThrow(/RESOURCE_FORBIDDEN/);
    await expect(createMockHost({
      ...fixture,
      grants: ['db:write:costs', 'db:write:files'],
      trips: { 1: { members: [42], costs: [{ id: 9 }], files: [{ id: 3 }], canEditCosts: false } },
    }).ctx.costs.attachFile(1, 9, 3)).rejects.toThrow(/RESOURCE_FORBIDDEN/);
    await expect(createMockHost({
      ...fixture,
      grants: ['db:write:costs', 'db:write:files'],
      trips: { 1: { members: [42], costs: [{ id: 9 }], files: [{ id: 3 }], can: { file_edit: false } } },
    }).ctx.costs.attachFile(1, 9, 3)).rejects.toThrow(/RESOURCE_FORBIDDEN/);
  });

  it('keeps binary upload on files.create before attaching its returned File', async () => {
    const host = createMockHost({
      grants,
      actingUserId: 42,
      trips: { 1: { members: [42], costs: [{ id: 9 }], files: [] } },
    });
    const uploaded = await host.ctx.files.create(1, { name: 'receipt.pdf', content_base64: 'cGRm' });
    await host.ctx.costs.attachFile(1, 9, uploaded.id);
    expect((await host.ctx.costs.listFiles(1, 9)).map((file) => file.id)).toEqual([uploaded.id]);
  });
});
