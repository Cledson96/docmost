import { getSchema } from '@tiptap/core';
import { uniqueIdNodeTypes } from '@docmost/editor-ext';
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

  it('derives agent-addressable nodes from the shared UniqueID types', () => {
    expect(agentAddressableNodeTypes).toEqual(uniqueIdNodeTypes);
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

  it('describes every attribute exposed by each public TipTap type', () => {
    const schema = getSchema(tiptapExtensions);
    const mismatches: Array<{ name: string; attributes: string[] }> = [];

    for (const capability of richContentCapabilities) {
      const schemaType =
        capability.category === 'node'
          ? schema.nodes[capability.name]
          : schema.marks[capability.name];
      const contractAttributes = capability.attributes
        .map((attribute) => attribute.name)
        .sort();

      const schemaAttributes = Object.keys(schemaType.spec.attrs ?? {}).sort();

      if (
        JSON.stringify(contractAttributes) !== JSON.stringify(schemaAttributes)
      ) {
        mismatches.push({
          name: capability.name,
          attributes: schemaAttributes,
        });
      }
    }

    expect(mismatches).toEqual([]);
  });

  it('labels known upload and pending attributes as transient', () => {
    const transientAttributes = richContentCapabilities.flatMap((capability) =>
      capability.attributes
        .filter((attribute) => attribute.transient)
        .map((attribute) => `${capability.name}.${attribute.name}`),
    );

    expect(transientAttributes.sort()).toEqual(
      [
        'attachment.placeholder',
        'audio.placeholder',
        'base.pendingKey',
        'image.placeholder',
        'pdf.placeholder',
        'video.placeholder',
      ].sort(),
    );
  });

  it('describes attribute types and closed domains useful to rich-content agents', () => {
    const attribute = (capabilityName: string, attributeName: string) =>
      richContentCapabilities
        .find((capability) => capability.name === capabilityName)
        ?.attributes.find((candidate) => candidate.name === attributeName);

    expect(attribute('columns', 'layout')).toMatchObject({
      type: 'string',
      enum: [
        'two_equal',
        'two_left_sidebar',
        'two_right_sidebar',
        'three_equal',
        'three_left_wide',
        'three_right_wide',
        'three_with_sidebars',
        'four_equal',
        'five_equal',
      ],
    });
    expect(attribute('columns', 'widthMode')).toMatchObject({
      type: 'string',
      enum: ['normal', 'wide'],
    });
    expect(attribute('image', 'width')).toMatchObject({
      type: 'number | string',
      format: 'percentage-or-number',
    });
    expect(attribute('image', 'size')).toMatchObject({ type: 'number' });
    expect(attribute('image', 'src')).toMatchObject({
      type: 'string',
      format: 'uri',
    });
    expect(attribute('attachment', 'attachmentId')).toMatchObject({
      type: 'string',
      format: 'identifier',
    });
    expect(attribute('details', 'open')).toMatchObject({ type: 'boolean' });
    expect(attribute('status', 'color')).toMatchObject({
      type: 'string',
      enum: ['gray', 'blue', 'green', 'yellow', 'red', 'purple'],
    });
  });

  it('preserves the schema types of transient upload attributes', () => {
    const attribute = (capabilityName: string, attributeName: string) =>
      richContentCapabilities
        .find((capability) => capability.name === capabilityName)
        ?.attributes.find((candidate) => candidate.name === attributeName);

    expect(attribute('attachment', 'placeholder')).toMatchObject({
      type: 'string',
      transient: true,
    });
    for (const capabilityName of ['audio', 'image', 'pdf', 'video']) {
      expect(attribute(capabilityName, 'placeholder')).toMatchObject({
        type: 'object',
        transient: true,
      });
    }
  });

  it.each([
    ['image', 'width', 'number | string', 'percentage-or-number'],
    ['image', 'height', 'number', undefined],
    ['video', 'width', 'number | string', 'percentage-or-number'],
    ['video', 'height', 'number', undefined],
    ['pdf', 'width', 'number', undefined],
    ['pdf', 'height', 'number', undefined],
    ['drawio', 'width', 'number | string', 'percentage-or-number'],
    ['drawio', 'height', 'number', undefined],
    ['excalidraw', 'width', 'number | string', 'percentage-or-number'],
    ['excalidraw', 'height', 'number', undefined],
    ['embed', 'width', 'number', undefined],
    ['embed', 'height', 'number', undefined],
  ])(
    'describes %s.%s dimensions faithfully',
    (capabilityName, attributeName, type, format) => {
      const attribute = richContentCapabilities
        .find((capability) => capability.name === capabilityName)
        ?.attributes.find((candidate) => candidate.name === attributeName);

      expect(attribute?.type).toBe(type);
      expect(attribute?.format).toBe(format);
    },
  );

  it('registers every agent-addressable type as a schema node, never a mark', () => {
    const schema = getSchema(tiptapExtensions);

    for (const type of agentAddressableNodeTypes) {
      expect(schema.nodes[type]).toBeDefined();
      expect(schema.marks[type]).toBeUndefined();
    }
  });
});
