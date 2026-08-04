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

const internalSchemaNodeTypes = [
  'doc',
  'text',
  'listItem',
  'taskItem',
  'detailsContent',
  'detailsSummary',
  'column',
  'tableRow',
  'tableCell',
  'tableHeader',
] as const;

// `comment` is collaboration-only metadata; structural nodes are implementation
// details required by public container nodes and cannot be authored directly.
const internalSchemaMarkTypes = ['comment'] as const;

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

  it('includes every public TipTap schema type in the discovery contract', () => {
    const schema = getSchema(tiptapExtensions);
    const contractNodeTypes = richContentCapabilities
      .filter((capability) => capability.category === 'node')
      .map((capability) => capability.name)
      .sort();
    const publicSchemaNodeTypes = Object.keys(schema.nodes)
      .filter((type) => !internalSchemaNodeTypes.includes(type as never))
      .sort();
    const contractMarkTypes = richContentCapabilities
      .filter((capability) => capability.category === 'mark')
      .map((capability) => capability.name)
      .sort();

    expect(publicSchemaNodeTypes).toEqual(contractNodeTypes);
    const publicSchemaMarkTypes = Object.keys(schema.marks)
      .filter((type) => !internalSchemaMarkTypes.includes(type as never))
      .sort();

    expect(publicSchemaMarkTypes).toEqual(contractMarkTypes);
  });

  it('describes serializable attributes needed to create rich content', () => {
    const attributesFor = (name: string) =>
      richContentCapabilities
        .find((capability) => capability.name === name)
        ?.attributes.map((attribute) => attribute.name);

    expect(attributesFor('attachment')).toEqual(
      expect.arrayContaining(['url', 'name', 'mime', 'size', 'attachmentId']),
    );
    expect(attributesFor('audio')).toEqual(
      expect.arrayContaining(['src', 'attachmentId', 'size']),
    );
    expect(attributesFor('base')).toEqual(
      expect.arrayContaining(['pageId', 'pendingKey']),
    );
    expect(attributesFor('mention')).toEqual(
      expect.arrayContaining([
        'id',
        'label',
        'entityType',
        'entityId',
        'slugId',
        'creatorId',
        'anchorId',
      ]),
    );

    const pendingKey = richContentCapabilities
      .find((capability) => capability.name === 'base')
      ?.attributes.find((attribute) => attribute.name === 'pendingKey');

    expect(pendingKey?.transient).toBe(true);
  });

  it('registers every agent-addressable type as a schema node, never a mark', () => {
    const schema = getSchema(tiptapExtensions);

    for (const type of agentAddressableNodeTypes) {
      expect(schema.nodes[type]).toBeDefined();
      expect(schema.marks[type]).toBeUndefined();
    }
  });
});
