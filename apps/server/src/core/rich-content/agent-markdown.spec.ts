import {
  AgentMarkdownError,
  agentMarkdownToProsemirror,
  prosemirrorToAgentMarkdown,
} from '@docmost/editor-ext';
import { tiptapExtensions } from '../../collaboration/collaboration.util';

describe('agent markdown', () => {
  it('round-trips nested columns and rich block attributes', async () => {
    const doc = {
      type: 'doc',
      content: [
        {
          type: 'columns',
          attrs: { layout: 'two_equal', widthMode: 'wide' },
          content: [
            {
              type: 'column',
              content: [
                { type: 'paragraph', attrs: { id: 'p-1' }, content: [{ type: 'text', text: 'Left' }] },
              ],
            },
            {
              type: 'column',
              content: [
                {
                  type: 'embed',
                  attrs: { src: 'https://example.com/embed', provider: 'generic', width: 640, height: 400, align: 'center' },
                },
              ],
            },
          ],
        },
        { type: 'subpages', attrs: {} },
      ],
    };

    const markdown = prosemirrorToAgentMarkdown(doc, tiptapExtensions);

    expect(markdown).toContain(':::docmost-columns');
    expect(markdown).toContain(':::docmost-subpages');
    expect(await agentMarkdownToProsemirror(markdown, tiptapExtensions)).toMatchObject(doc);
  });

  it('round-trips status and mention inline directives', async () => {
    const doc = {
      type: 'doc',
      content: [{
        type: 'paragraph',
        attrs: { id: 'p-1' },
        content: [
          { type: 'text', text: 'Owner: ' },
          { type: 'mention', attrs: { id: 'm-1', label: 'Ada', entityType: 'user', entityId: 'user-1', slugId: null, creatorId: 'user-2', anchorId: null } },
          { type: 'text', text: ' ' },
          { type: 'status', attrs: { text: 'In progress', color: 'blue' } },
        ],
      }],
    };

    const markdown = prosemirrorToAgentMarkdown(doc, tiptapExtensions);

    expect(markdown).toContain('{{docmost:mention ');
    expect(markdown).toContain('{{docmost:status ');
    expect(await agentMarkdownToProsemirror(markdown, tiptapExtensions)).toMatchObject(doc);
  });

  it('keeps ordinary Markdown semantic after a round trip', async () => {
    const markdown = '# Title\n\n- one\n- two\n\n**bold** and [link](https://example.com)';
    const doc = await agentMarkdownToProsemirror(markdown, tiptapExtensions);

    expect(prosemirrorToAgentMarkdown(doc, tiptapExtensions)).toContain('# Title');
  });

  it.each([
    [':::docmost-unknown\nid: null\nattrs: {}\n:::', 'UNKNOWN_TYPE'],
    [':::docmost-embed\nid: [not valid\nattrs: {}\n:::', 'INVALID_YAML'],
    ['{{docmost:mention nope}}', 'INVALID_BASE64URL'],
    ['{{docmost:embed eyJpZCI6bnVsbCwiYXR0cnMiOnt9fQ}}', 'INLINE_TYPE_INCOMPATIBLE'],
  ])('rejects invalid agent markdown: %s', async (markdown, code) => {
    await expect(agentMarkdownToProsemirror(markdown, tiptapExtensions)).rejects.toMatchObject({
      name: AgentMarkdownError.name,
      code,
    });
  });

  it('rejects duplicate persistent ids', async () => {
    await expect(agentMarkdownToProsemirror(':::docmost-subpages\nid: duplicate\nattrs: {}\n:::\n\n:::docmost-subpages\nid: duplicate\nattrs: {}\n:::', tiptapExtensions)).rejects.toMatchObject({
      code: 'DUPLICATE_ID',
    });
  });
});
