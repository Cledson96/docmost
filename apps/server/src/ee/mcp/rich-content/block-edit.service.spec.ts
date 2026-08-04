import { BlockEditService } from './block-edit.service';
import { ForbiddenException } from '@nestjs/common';

const page = {
  id: 'page-1',
  workspaceId: 'workspace-1',
  deletedAt: null,
} as any;
const user = { id: 'user-1' } as any;
const workspace = { id: 'workspace-1' } as any;

function buildService(overrides: Record<string, any> = {}) {
  const pageRepo = { findById: jest.fn().mockResolvedValue(page) };
  const pageAccessService = { validateCanEdit: jest.fn(), validateCanView: jest.fn() };
  const collaborationGateway = {
    handleYjsEvent: jest.fn().mockResolvedValue({ revision: 'revision-2' }),
  };
  return {
    service: new BlockEditService(pageRepo as any, pageAccessService as any, collaborationGateway as any),
    deps: { pageRepo, pageAccessService, collaborationGateway, ...overrides },
  };
}

describe('BlockEditService', () => {
  it('authorizes edits and forwards a normalized atomic payload with the authenticated user', async () => {
    const { service, deps } = buildService();

    await expect(service.edit({
      pageId: 'page-1',
      expectedRevision: 'revision-1',
      operations: [{ type: 'insertAfter', target: 'block-1', content: 'A nested **paragraph**' }],
    }, user, workspace)).resolves.toEqual({ pageId: 'page-1', revision: 'revision-2' });

    expect(deps.pageAccessService.validateCanEdit).toHaveBeenCalledWith(page, user);
    expect(deps.collaborationGateway.handleYjsEvent).toHaveBeenCalledWith(
      'editPageBlocks',
      'page.page-1',
      expect.objectContaining({
        expectedRevision: 'revision-1',
        user,
        operations: [expect.objectContaining({
          type: 'insertAfter',
          target: 'block-1',
          content: expect.objectContaining({ type: 'paragraph' }),
        })],
      }),
    );
  });

  it('does not dispatch an edit when page access is denied', async () => {
    const { service, deps } = buildService();
    deps.pageAccessService.validateCanEdit.mockRejectedValue(new ForbiddenException());

    await expect(service.edit({ pageId: 'page-1', expectedRevision: 'revision-1', operations: [] }, user, workspace)).rejects.toBeInstanceOf(ForbiddenException);
    expect(deps.collaborationGateway.handleYjsEvent).not.toHaveBeenCalled();
  });

  it('verifies access to pages referenced by nested Agent Markdown before dispatching', async () => {
    const referencedPage = { ...page, id: 'page-2' };
    const { service, deps } = buildService();
    deps.pageRepo.findById
      .mockResolvedValueOnce(page)
      .mockResolvedValueOnce(referencedPage);
    deps.pageAccessService.validateCanView.mockRejectedValue(new ForbiddenException());

    await expect(service.edit({
      pageId: 'page-1', expectedRevision: 'revision-1',
      operations: [{ type: 'insertAfter', target: 'block-1', content: ':::docmost-base\nid: block-2\nattrs:\n  pageId: page-2\n:::' }],
    }, user, workspace)).rejects.toBeInstanceOf(ForbiddenException);
    expect(deps.collaborationGateway.handleYjsEvent).not.toHaveBeenCalled();
  });

  it('verifies access to page references nested in update attrs before dispatching', async () => {
    const referencedPage = { ...page, id: 'page-2' };
    const { service, deps } = buildService();
    deps.pageRepo.findById
      .mockResolvedValueOnce(page)
      .mockResolvedValueOnce(referencedPage);
    deps.pageAccessService.validateCanView.mockRejectedValue(new ForbiddenException());

    await expect(service.edit({
      pageId: 'page-1', expectedRevision: 'revision-1',
      operations: [{
        type: 'update',
        target: 'block-1',
        attrs: { nested: { sourcePageId: 'page-2' } },
      }],
    }, user, workspace)).rejects.toBeInstanceOf(ForbiddenException);

    expect(deps.pageAccessService.validateCanView).toHaveBeenCalledWith(referencedPage, user);
    expect(deps.collaborationGateway.handleYjsEvent).not.toHaveBeenCalled();
  });

  it.each([
    [{ pageId: 'page-1', operations: [], resolved: {} }, 'INVALID_REQUEST'],
    [{ pageId: 'page-1', expectedRevision: 'revision-1', operations: Array.from({ length: 51 }, () => ({ type: 'delete', target: 'block-1' })) }, 'TOO_MANY_OPERATIONS'],
    [{ pageId: 'page-1', expectedRevision: 1, operations: [] }, 'INVALID_REQUEST'],
    [{ pageId: 'page-1', operations: [] }, 'INVALID_REQUEST'],
  ])('rejects invalid edit input with a stable code', async (input, code) => {
    const { service, deps } = buildService();

    await expect(service.edit(input as any, user, workspace)).rejects.toMatchObject({ code });
    expect(deps.collaborationGateway.handleYjsEvent).not.toHaveBeenCalled();
  });
});
