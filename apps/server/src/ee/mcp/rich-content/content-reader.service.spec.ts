import { ContentReaderService } from './content-reader.service';

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
});
