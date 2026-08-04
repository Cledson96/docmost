import { getSchema } from '@tiptap/core';
import {
  agentAddressableNodeTypes,
  richContentCapabilities,
} from './rich-content-capabilities';
import { tiptapExtensions } from '../../collaboration/collaboration.util';

const expectedCapabilityNames = [
  'attachment',
  'audio',
  'base',
  'blockquote',
  'bold',
  'bulletList',
  'callout',
  'code',
  'codeBlock',
  'columns',
  'details',
  'drawio',
  'embed',
  'excalidraw',
  'hardBreak',
  'heading',
  'highlight',
  'horizontalRule',
  'image',
  'italic',
  'link',
  'mathBlock',
  'mathInline',
  'mention',
  'orderedList',
  'pageBreak',
  'paragraph',
  'pdf',
  'status',
  'strike',
  'subpages',
  'subscript',
  'superscript',
  'table',
  'taskList',
  'textStyle',
  'transclusionReference',
  'transclusionSource',
  'underline',
  'video',
  'youtube',
] as const;

describe('rich content capabilities', () => {
  it('offers exactly the public editor capabilities and excludes comment', () => {
    expect(
      richContentCapabilities.map((capability) => capability.name).sort(),
    ).toEqual([...expectedCapabilityNames].sort());
    expect(
      richContentCapabilities.map((capability) => capability.name),
    ).not.toContain('comment');
  });

  it('only exposes nodes with persistent ids as agent-addressable blocks', () => {
    const capabilitiesByName = new Map(
      richContentCapabilities.map((capability) => [
        capability.name,
        capability,
      ]),
    );

    for (const type of agentAddressableNodeTypes) {
      const capability = capabilitiesByName.get(type);

      expect(capability).toBeDefined();
      expect(capability?.category).toBe('node');
      expect(capability?.blockAddressable).toBe(true);
    }
  });

  it('registers every public capability in the TipTap schema', () => {
    const schema = getSchema(tiptapExtensions);

    for (const capability of richContentCapabilities) {
      const schemaTypes =
        capability.category === 'node' ? schema.nodes : schema.marks;

      expect(schemaTypes[capability.name]).toBeDefined();
    }
  });

  it('registers every agent-addressable type as a schema node, never a mark', () => {
    const schema = getSchema(tiptapExtensions);

    for (const type of agentAddressableNodeTypes) {
      expect(schema.nodes[type]).toBeDefined();
      expect(schema.marks[type]).toBeUndefined();
    }
  });
});
