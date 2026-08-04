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

  it('restores inline directives adjacent to ordinary text', async () => {
    const mention = Buffer.from(JSON.stringify({
      id: 'm-1',
      attrs: {
        id: 'm-1',
        label: 'Ada',
        entityType: 'user',
        entityId: 'user-1',
        slugId: null,
        creatorId: 'user-2',
        anchorId: null,
      },
    })).toString('base64url');
    const status = Buffer.from(JSON.stringify({
      id: null,
      attrs: { text: 'In progress', color: 'blue' },
    })).toString('base64url');

    await expect(agentMarkdownToProsemirror(
      `Owner: {{docmost:mention ${mention}}} {{docmost:status ${status}}}`,
      tiptapExtensions,
    )).resolves.toMatchObject({
      type: 'doc',
      content: [{
        type: 'paragraph',
        content: [
          { type: 'text', text: 'Owner: ' },
          { type: 'mention', attrs: { id: 'm-1', label: 'Ada' } },
          { type: 'text', text: ' ' },
          { type: 'status', attrs: { text: 'In progress', color: 'blue' } },
        ],
      }],
    });
  });

  it('keeps ordinary Markdown semantic after a round trip', async () => {
    const markdown = '# Title\n\n- one\n- two\n\n**bold** and [link](https://example.com)';
    const doc = await agentMarkdownToProsemirror(markdown, tiptapExtensions);

    expect(prosemirrorToAgentMarkdown(doc, tiptapExtensions)).toContain('# Title');
  });

  it('keeps block directives literal inside fenced code blocks', async () => {
    const markdown = '```yaml\n:::docmost-subpages\nid: null\nattrs: {}\n:::\n```';

    const doc = await agentMarkdownToProsemirror(markdown, tiptapExtensions);

    expect(doc).toMatchObject({
      type: 'doc',
      content: [{
        type: 'codeBlock',
        attrs: { language: 'yaml' },
        content: [{ type: 'text', text: ':::docmost-subpages\nid: null\nattrs: {}\n:::\n' }],
      }],
    });
    expect(prosemirrorToAgentMarkdown(doc, tiptapExtensions)).toContain(':::docmost-subpages\nid: null\nattrs: {}\n:::');
  });

  it('keeps inline directives literal inside fenced code blocks', async () => {
    const payload = Buffer.from(JSON.stringify({
      id: null,
      attrs: { text: 'In progress', color: 'blue' },
    })).toString('base64url');
    const markdown = `~~~text\n{{docmost:status ${payload}}}\n~~~`;

    const doc = await agentMarkdownToProsemirror(markdown, tiptapExtensions);

    expect(doc).toMatchObject({
      type: 'doc',
      content: [{
        type: 'codeBlock',
        attrs: { language: 'text' },
        content: [{ type: 'text', text: `{{docmost:status ${payload}}}\n` }],
      }],
    });
    expect(prosemirrorToAgentMarkdown(doc, tiptapExtensions)).toContain(`{{docmost:status ${payload}}}`);
  });

  it.each([
    ['a blockquote', '> ```yaml\n> :::docmost-subpages\n> id: null\n> attrs: {}\n> :::\n> ```'],
    ['a list item', '- example\n\n    ```yaml\n    :::docmost-subpages\n    id: null\n    attrs: {}\n    :::\n    ```'],
    ['an indented code block', '    :::docmost-subpages\n    id: null\n    attrs: {}\n    :::'],
  ])('keeps block directives literal inside code in %s', async (_context, markdown) => {
    const doc = await agentMarkdownToProsemirror(markdown, tiptapExtensions);

    expect(prosemirrorToAgentMarkdown(doc, tiptapExtensions)).toContain(':::docmost-subpages');
  });

  it.each([
    ['a blockquote', '> ```text\n> {{docmost:unknown nope}}\n> ```'],
    ['a list item', '- example\n\n    ```text\n    {{docmost:unknown nope}}\n    ```'],
    ['an indented code block', '    {{docmost:unknown nope}}'],
  ])('keeps inline directives literal inside code in %s', async (_context, markdown) => {
    const doc = await agentMarkdownToProsemirror(markdown, tiptapExtensions);

    expect(prosemirrorToAgentMarkdown(doc, tiptapExtensions)).toContain('{{docmost:unknown nope}}');
  });

  it('keeps directives literal when an outer fence uses a longer delimiter', async () => {
    const markdown = '> ````text\n> {{docmost:unknown nope}}\n> ```\n> :::docmost-subpages\n> id: null\n> attrs: {}\n> :::\n> ````';

    const doc = await agentMarkdownToProsemirror(markdown, tiptapExtensions);

    expect(prosemirrorToAgentMarkdown(doc, tiptapExtensions)).toContain('> {{docmost:unknown nope}}\n> ```\n> :::docmost-subpages');
  });

  it.each([
    [':::docmost-unknown\nid: null\nattrs: {}\n:::', 'UNKNOWN_TYPE'],
    [':::docmost-embed\nid: [not valid\nattrs: {}\n:::', 'INVALID_YAML'],
    ['{{docmost:mention nope}}', 'INVALID_BASE64URL'],
    ['{{docmost:embed eyJpZCI6bnVsbCwiYXR0cnMiOnt9fQ}}', 'INLINE_TYPE_INCOMPATIBLE'],
    [':::docmost-subpages\nid: null\nattrs: {}\n---\n:::docmost-embed\nid: null\nattrs: {}\n:::', 'INVALID_DIRECTIVE'],
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
