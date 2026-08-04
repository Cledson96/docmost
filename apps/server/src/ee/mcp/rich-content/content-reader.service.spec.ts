import { ContentReaderService } from './content-reader.service';

const user = { id: 'user-1' } as any;
const page = { id: 'page-1', spaceId: 'space-1', workspaceId: 'workspace-1' } as any;

describe('ContentReaderService', () => {
  it('reads registered nodes and inline nodes in document order without mutating legacy content', () => {
    const content: any = {
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          attrs: { id: 'paragraph-1' },
          content: [
            { type: 'text', text: 'Owner: ' },
            {
              type: 'mention',
              attrs: { entityType: 'user', entityId: 'user-1', label: 'Ada' },
            },
          ],
        },
        {
          type: 'bulletList',
          content: [
            {
              type: 'listItem',
              content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Legacy' }] }],
            },
          ],
        },
      ],
    };

    const result = new ContentReaderService().read({ revision: 'revision-1', content });

    expect(result.revision).toBe('revision-1');
    expect(result.content).toContain('Owner:');
    expect(result.blocks).toEqual([
      expect.objectContaining({
        id: 'paragraph-1',
        type: 'paragraph',
        path: [0],
        attrs: { id: 'paragraph-1' },
        operations: ['create'],
      }),
      expect.objectContaining({
        id: 'legacy:revision-1:0.1',
        type: 'mention',
        path: [0, 1],
        attrs: { entityType: 'user', entityId: 'user-1', label: 'Ada' },
        operations: ['create'],
      }),
      expect.objectContaining({
        id: 'legacy:revision-1:1',
        type: 'bulletList',
        path: [1],
        attrs: {},
        operations: ['create'],
      }),
      expect.objectContaining({
        id: 'legacy:revision-1:1.0.0',
        type: 'paragraph',
        path: [1, 0, 0],
        attrs: {},
        operations: ['create'],
      }),
    ]);
    expect(result.blocks.map((block) => block.type)).not.toContain('listItem');
    expect(content.content[1].content[0].content[0].attrs).toBeUndefined();
  });

  it('resolves dynamic blocks with viewer-filtered data and reports individual resolution failures', async () => {
    const pageService = {
      getSidebarPages: jest.fn().mockResolvedValue({
        items: [{ id: 'child-1', title: 'Visible child', position: 'a0' }],
        meta: { limit: 20, hasNextPage: false, hasPrevPage: false, nextCursor: null, prevCursor: null },
      }),
    };
    const pageRepo = {
      findById: jest.fn().mockResolvedValue({ id: 'base-1', workspaceId: 'workspace-1', isBase: true }),
    };
    const pageAccessService = { validateCanView: jest.fn() };
    const baseService = {
      getBaseInfo: jest.fn().mockResolvedValue({ id: 'base-1', name: 'Roadmap', properties: [] }),
    };
    const transclusionService = {
      lookup: jest.fn().mockResolvedValue({
        items: [{ sourcePageId: 'source-1', transclusionId: 'block-1', content: [{ type: 'paragraph' }] }],
      }),
    };
    const service = new ContentReaderService(
      pageService as any,
      pageRepo as any,
      pageAccessService as any,
      baseService as any,
      transclusionService as any,
    );

    const result = await service.readResolved(
      {
        revision: 'revision-1',
        content: {
          type: 'doc',
          content: [
            { type: 'subpages', attrs: {} },
            { type: 'base', attrs: { pageId: 'base-1' } },
            { type: 'transclusionReference', attrs: { sourcePageId: 'source-1', transclusionId: 'block-1' } },
            { type: 'base', attrs: {} },
          ],
        },
      },
      { page, user, workspaceId: 'workspace-1' },
    );

    expect(pageService.getSidebarPages).toHaveBeenCalledWith(
      'space-1',
      expect.objectContaining({ limit: 20 }),
      'page-1',
      'user-1',
      true,
    );
    expect(pageAccessService.validateCanView).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'base-1' }),
      user,
    );
    expect(baseService.getBaseInfo).toHaveBeenCalledWith('base-1', 'workspace-1');
    expect(transclusionService.lookup).toHaveBeenCalledWith(
      [{ sourcePageId: 'source-1', transclusionId: 'block-1' }],
      'user-1',
      'workspace-1',
    );
    expect(result.blocks.map((block: any) => block.resolved)).toEqual([
      expect.objectContaining({ items: [{ id: 'child-1', title: 'Visible child', position: 'a0' }] }),
      { id: 'base-1', name: 'Roadmap', properties: [] },
      expect.objectContaining({ content: [{ type: 'paragraph' }] }),
      expect.objectContaining({ code: 'DYNAMIC_RESOLUTION_FAILED', type: 'base' }),
    ]);
  });
});
