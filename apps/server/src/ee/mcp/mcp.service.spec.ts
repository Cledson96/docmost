import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { McpService } from './mcp.service';

const user = { id: 'user-1' } as any;
const workspace = { id: 'workspace-1' } as any;

const page = {
  id: 'page-1',
  slugId: 'abc123',
  title: 'Page',
  spaceId: 'space-1',
  workspaceId: 'workspace-1',
  parentPageId: null,
  deletedAt: null,
  content: {},
} as any;

function buildService(overrides: Partial<Record<string, any>> = {}) {
  const deps: Record<string, any> = {
    db: {},
    pageService: {
      create: jest.fn(),
      update: jest.fn().mockResolvedValue(page),
      removePage: jest.fn(),
    },
    pageRepo: { findById: jest.fn().mockResolvedValue(page) },
    pageAccessService: {
      validateCanView: jest.fn(),
      validateCanEdit: jest.fn(),
    },
    pagePermissionRepo: { filterAccessiblePageIds: jest.fn() },
    spaceMemberRepo: { getUserSpaceIds: jest.fn().mockResolvedValue([]) },
    spaceAbility: { createForUser: jest.fn() },
    baseService: { createBase: jest.fn() },
    auditService: { log: jest.fn() },
    ...overrides,
  };

  const service = new McpService(
    deps.db as any,
    deps.pageService as any,
    deps.pageRepo as any,
    deps.pageAccessService as any,
    deps.pagePermissionRepo as any,
    deps.spaceMemberRepo as any,
    deps.spaceAbility as any,
    deps.baseService as any,
    deps.auditService as any,
  );

  return { service, deps };
}

function callTool(service: McpService, name: string, args: any) {
  return service.handleRpcRequest(
    { jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name, arguments: args } },
    user,
    workspace,
  );
}

describe('McpService permissions', () => {
  it('get_page rejects a page the user cannot view', async () => {
    const { service, deps } = buildService();
    deps.pageAccessService.validateCanView.mockRejectedValue(
      new ForbiddenException(),
    );

    const res: any = await callTool(service, 'get_page', { pageId: 'page-1' });

    expect(res.result.isError).toBe(true);
    expect(res.result.content[0].text).toContain('do not have permission');
  });

  it('get_page returns the page when access is granted', async () => {
    const { service, deps } = buildService();

    const res: any = await callTool(service, 'get_page', { pageId: 'page-1' });

    expect(deps.pageAccessService.validateCanView).toHaveBeenCalledWith(
      page,
      user,
    );
    expect(res.result.isError).toBeUndefined();
    expect(JSON.parse(res.result.content[0].text).id).toBe('page-1');
  });

  it('get_page hides pages from other workspaces behind "not found"', async () => {
    const { service, deps } = buildService();
    deps.pageRepo.findById.mockResolvedValue({
      ...page,
      workspaceId: 'other-workspace',
    });

    const res: any = await callTool(service, 'get_page', { pageId: 'page-1' });

    expect(res.result.isError).toBe(true);
    expect(res.result.content[0].text).toContain('Page not found');
    expect(deps.pageAccessService.validateCanView).not.toHaveBeenCalled();
  });

  it('delete_page validates edit access before trashing', async () => {
    const { service, deps } = buildService();
    deps.pageAccessService.validateCanEdit.mockRejectedValue(
      new ForbiddenException(),
    );

    const res: any = await callTool(service, 'delete_page', {
      pageId: 'page-1',
    });

    expect(res.result.isError).toBe(true);
    expect(deps.pageService.removePage).not.toHaveBeenCalled();
  });

  it('delete_page goes through pageService so children and audit are handled', async () => {
    const { service, deps } = buildService();

    await callTool(service, 'delete_page', { pageId: 'page-1' });

    expect(deps.pageService.removePage).toHaveBeenCalledWith(
      'page-1',
      'user-1',
      'workspace-1',
    );
    expect(deps.auditService.log).toHaveBeenCalled();
  });

  it('update_page validates edit access', async () => {
    const { service, deps } = buildService();
    deps.pageAccessService.validateCanEdit.mockRejectedValue(
      new ForbiddenException(),
    );

    const res: any = await callTool(service, 'update_page', {
      pageId: 'page-1',
      title: 'New',
    });

    expect(res.result.isError).toBe(true);
    expect(deps.pageService.update).not.toHaveBeenCalled();
  });

  it('create_page requires create permission on the target space', async () => {
    const { service, deps } = buildService();
    deps.spaceAbility.createForUser.mockResolvedValue({
      cannot: () => true,
      can: () => false,
    });

    const res: any = await callTool(service, 'create_page', {
      title: 'New',
      spaceId: 'space-1',
    });

    expect(res.result.isError).toBe(true);
    expect(deps.pageService.create).not.toHaveBeenCalled();
  });

  it('create_page requires edit permission on the parent page', async () => {
    const { service, deps } = buildService();
    deps.pageAccessService.validateCanEdit.mockRejectedValue(
      new ForbiddenException(),
    );

    const res: any = await callTool(service, 'create_page', {
      title: 'New',
      spaceId: 'space-1',
      parentPageId: 'page-1',
    });

    expect(res.result.isError).toBe(true);
    expect(deps.spaceAbility.createForUser).not.toHaveBeenCalled();
    expect(deps.pageService.create).not.toHaveBeenCalled();
  });

  it('create_base checks the space resolved from the parent page', async () => {
    const { service, deps } = buildService();
    deps.baseService.createBase.mockResolvedValue({ id: 'base-1', title: 'K' });

    await callTool(service, 'create_base', {
      name: 'K',
      parentPageId: 'page-1',
    });

    expect(deps.pageAccessService.validateCanEdit).toHaveBeenCalledWith(
      page,
      user,
    );
    expect(deps.baseService.createBase).toHaveBeenCalledWith(
      expect.objectContaining({ spaceId: 'space-1' }),
      'user-1',
      'workspace-1',
    );
  });

  it('base write tools require edit access on the base page', async () => {
    const { service, deps } = buildService({
      baseService: { createRow: jest.fn() },
    });
    deps.pageRepo.findById.mockResolvedValue({ ...page, isBase: true });
    deps.pageAccessService.validateCanEdit.mockRejectedValue(
      new ForbiddenException(),
    );

    const res: any = await callTool(service, 'create_base_row', {
      pageId: 'page-1',
      cells: { prop: 'x' },
    });

    expect(res.result.isError).toBe(true);
    expect(deps.baseService.createRow).not.toHaveBeenCalled();
  });

  it('base read tools require view access on the base page', async () => {
    const { service, deps } = buildService({
      baseService: { listRows: jest.fn() },
    });
    deps.pageRepo.findById.mockResolvedValue({ ...page, isBase: true });
    deps.pageAccessService.validateCanView.mockRejectedValue(
      new ForbiddenException(),
    );

    const res: any = await callTool(service, 'list_base_rows', {
      pageId: 'page-1',
    });

    expect(res.result.isError).toBe(true);
    expect(deps.baseService.listRows).not.toHaveBeenCalled();
  });

  it('base tools reject a page that is not a base', async () => {
    const { service, deps } = buildService({
      baseService: { listRows: jest.fn() },
    });
    deps.pageRepo.findById.mockResolvedValue({ ...page, isBase: false });

    const res: any = await callTool(service, 'list_base_rows', {
      pageId: 'page-1',
    });

    expect(res.result.isError).toBe(true);
    expect(res.result.content[0].text).toContain('Base not found');
    expect(deps.baseService.listRows).not.toHaveBeenCalled();
  });

  it('base tools scope every call to the caller workspace', async () => {
    const { service, deps } = buildService({
      baseService: { updateRow: jest.fn().mockResolvedValue({ id: 'row-1' }) },
    });
    deps.pageRepo.findById.mockResolvedValue({ ...page, isBase: true });

    await callTool(service, 'update_base_row', {
      pageId: 'page-1',
      rowId: 'row-1',
      cells: { prop: 'x' },
    });

    expect(deps.baseService.updateRow).toHaveBeenCalledWith(
      { pageId: 'page-1', rowId: 'row-1', cells: { prop: 'x' } },
      'user-1',
      'workspace-1',
    );
  });

  it('exposes the page and base tool surface', async () => {
    const { service } = buildService();

    const res: any = await service.handleRpcRequest(
      { jsonrpc: '2.0', id: 1, method: 'tools/list' },
      user,
      workspace,
    );

    const names = res.result.tools.map((tool: any) => tool.name);

    expect(names).toEqual(expect.arrayContaining(['get_page', 'create_base_row']));
    expect(new Set(names).size).toBe(names.length);
  });

  it('list_spaces returns nothing when the user belongs to no space', async () => {
    const { service } = buildService();

    const res: any = await callTool(service, 'list_spaces', {});

    expect(JSON.parse(res.result.content[0].text)).toEqual({ spaces: [] });
  });
});
