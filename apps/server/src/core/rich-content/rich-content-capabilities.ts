export type RichContentCapabilityCategory = 'node' | 'mark';

export interface RichContentAttribute {
  name: string;
  description: string;
  required?: boolean;
  validation?: string;
  transient?: boolean;
}

export interface RichContentCapability {
  name: string;
  category: RichContentCapabilityCategory;
  blockAddressable: boolean;
  description: string;
  attributes: readonly RichContentAttribute[];
  constraints?: readonly string[];
}

const node = (
  name: string,
  description: string,
  options: Omit<RichContentCapability, 'name' | 'category' | 'description'>,
): RichContentCapability => ({
  name,
  category: 'node',
  description,
  ...options,
});

const mark = (
  name: string,
  description: string,
  attributes: readonly RichContentAttribute[] = [],
  constraints?: readonly string[],
): RichContentCapability => ({
  name,
  category: 'mark',
  blockAddressable: false,
  description,
  attributes,
  constraints,
});

/**
 * Public TipTap schema capabilities available to rich-content clients.
 * Keep this aligned with `tiptapExtensions`; internal collaboration marks such
 * as `comment` are intentionally not part of the public contract.
 */
export const richContentCapabilities = [
  node('attachment', 'Attached file block.', {
    blockAddressable: false,
    attributes: [
      { name: 'url', description: 'Attachment URL.', required: true },
      { name: 'name', description: 'Display file name.' },
      { name: 'mime', description: 'Attachment MIME type.' },
      { name: 'size', description: 'Attachment size in bytes.' },
      { name: 'attachmentId', description: 'Stored attachment identifier.' },
      {
        name: 'placeholder',
        description: 'Upload placeholder state.',
        transient: true,
      },
    ],
  }),
  node('audio', 'Embedded audio player.', {
    blockAddressable: false,
    attributes: [
      { name: 'src', description: 'Audio URL.', required: true },
      { name: 'attachmentId', description: 'Stored attachment identifier.' },
      { name: 'size', description: 'Audio size in bytes.' },
      {
        name: 'placeholder',
        description: 'Upload placeholder state.',
        transient: true,
      },
    ],
  }),
  node('base', 'Embedded Docmost base.', {
    blockAddressable: false,
    attributes: [
      { name: 'pageId', description: 'Base page identifier.', required: true },
      {
        name: 'pendingKey',
        description: 'Temporary client key until a base page is created.',
        transient: true,
      },
    ],
  }),
  node('blockquote', 'Quoted block.', {
    blockAddressable: false,
    attributes: [],
  }),
  mark('bold', 'Bold inline text.'),
  node('bulletList', 'Bulleted list.', {
    blockAddressable: false,
    attributes: [],
  }),
  node('callout', 'Callout block with a visual variant.', {
    blockAddressable: false,
    attributes: [
      { name: 'type', description: 'Callout variant.' },
      { name: 'icon', description: 'Optional callout icon.' },
    ],
  }),
  mark('code', 'Inline code text.'),
  node('codeBlock', 'Fenced code block.', {
    blockAddressable: false,
    attributes: [
      { name: 'language', description: 'Code language identifier.' },
    ],
  }),
  node('columns', 'Multi-column layout container.', {
    blockAddressable: false,
    attributes: [
      { name: 'layout', description: 'Column layout preset.' },
      { name: 'widthMode', description: 'Column width mode.' },
    ],
  }),
  node('details', 'Collapsible details block.', {
    blockAddressable: false,
    attributes: [
      { name: 'open', description: 'Whether details are expanded.' },
    ],
  }),
  node('drawio', 'Draw.io diagram embed.', {
    blockAddressable: false,
    attributes: [
      { name: 'src', description: 'Diagram URL.', required: true },
      { name: 'title', description: 'Diagram title.' },
      { name: 'alt', description: 'Diagram alternative text.' },
      { name: 'width', description: 'Diagram width.' },
      { name: 'height', description: 'Diagram height.' },
      { name: 'size', description: 'Diagram size in bytes.' },
      { name: 'aspectRatio', description: 'Diagram aspect ratio.' },
      { name: 'align', description: 'Diagram alignment.' },
      { name: 'attachmentId', description: 'Stored attachment identifier.' },
    ],
  }),
  node('embed', 'External embed block.', {
    blockAddressable: false,
    attributes: [
      { name: 'src', description: 'Embed URL.', required: true },
      { name: 'provider', description: 'Embed provider identifier.' },
      { name: 'align', description: 'Embed alignment.' },
      { name: 'width', description: 'Embed width.' },
      { name: 'height', description: 'Embed height.' },
    ],
  }),
  node('excalidraw', 'Excalidraw diagram embed.', {
    blockAddressable: false,
    attributes: [
      { name: 'src', description: 'Diagram URL.', required: true },
      { name: 'title', description: 'Diagram title.' },
      { name: 'alt', description: 'Diagram alternative text.' },
      { name: 'width', description: 'Diagram width.' },
      { name: 'height', description: 'Diagram height.' },
      { name: 'size', description: 'Diagram size in bytes.' },
      { name: 'aspectRatio', description: 'Diagram aspect ratio.' },
      { name: 'align', description: 'Diagram alignment.' },
      { name: 'attachmentId', description: 'Stored attachment identifier.' },
    ],
  }),
  node('hardBreak', 'Hard line break.', {
    blockAddressable: false,
    attributes: [],
  }),
  node('heading', 'Heading block.', {
    blockAddressable: true,
    attributes: [
      {
        name: 'id',
        description: 'Persistent block identifier.',
        required: true,
      },
      {
        name: 'level',
        description: 'Heading level.',
        validation: 'integer from 1 to 6',
      },
      { name: 'textAlign', description: 'Heading text alignment.' },
      { name: 'indent', description: 'Heading indentation level.' },
    ],
  }),
  mark('highlight', 'Highlighted inline text.', [
    { name: 'color', description: 'Highlight color.' },
    { name: 'colorName', description: 'Named highlight color.' },
  ]),
  node('horizontalRule', 'Horizontal divider.', {
    blockAddressable: false,
    attributes: [],
  }),
  node('image', 'Embedded image.', {
    blockAddressable: false,
    attributes: [
      { name: 'src', description: 'Image URL.', required: true },
      { name: 'width', description: 'Image width.' },
      { name: 'height', description: 'Image height.' },
      { name: 'align', description: 'Image alignment.' },
      { name: 'alt', description: 'Image alternative text.' },
      { name: 'attachmentId', description: 'Stored attachment identifier.' },
      { name: 'size', description: 'Image size in bytes.' },
      { name: 'aspectRatio', description: 'Image aspect ratio.' },
      {
        name: 'placeholder',
        description: 'Upload placeholder state.',
        transient: true,
      },
    ],
  }),
  mark('italic', 'Italic inline text.'),
  mark('link', 'Hyperlink inline text.', [
    { name: 'href', description: 'Destination URL.', required: true },
    { name: 'target', description: 'Link target.' },
    { name: 'rel', description: 'Link rel attribute.' },
    { name: 'class', description: 'Link CSS class.' },
    { name: 'title', description: 'Link title.' },
    { name: 'internal', description: 'Whether this is an internal link.' },
  ]),
  node('mathBlock', 'Block mathematical expression.', {
    blockAddressable: false,
    attributes: [
      { name: 'text', description: 'LaTex expression.', required: true },
    ],
  }),
  node('mathInline', 'Inline mathematical expression.', {
    blockAddressable: false,
    attributes: [
      { name: 'text', description: 'LaTex expression.', required: true },
    ],
  }),
  node('mention', 'Mention of a Docmost user or page.', {
    blockAddressable: false,
    attributes: [
      { name: 'id', description: 'Unique mention identifier.' },
      { name: 'label', description: 'Mention display label.' },
      {
        name: 'entityType',
        description: 'Mention target type.',
        required: true,
      },
      {
        name: 'entityId',
        description: 'Mention target identifier.',
        required: true,
      },
      { name: 'slugId', description: 'Mentioned page slug identifier.' },
      { name: 'creatorId', description: 'User who created the mention.' },
      { name: 'anchorId', description: 'Anchor within a mentioned page.' },
    ],
  }),
  node('orderedList', 'Numbered list.', {
    blockAddressable: false,
    attributes: [
      { name: 'start', description: 'Starting list number.' },
      { name: 'type', description: 'List marker type.' },
    ],
  }),
  node('pageBreak', 'Page break for print and export.', {
    blockAddressable: false,
    attributes: [],
  }),
  node('paragraph', 'Paragraph block.', {
    blockAddressable: true,
    attributes: [
      {
        name: 'id',
        description: 'Persistent block identifier.',
        required: true,
      },
      { name: 'textAlign', description: 'Paragraph text alignment.' },
      { name: 'indent', description: 'Paragraph indentation level.' },
    ],
  }),
  node('pdf', 'Embedded PDF document.', {
    blockAddressable: false,
    attributes: [
      { name: 'src', description: 'PDF URL.', required: true },
      { name: 'name', description: 'Display file name.' },
      { name: 'attachmentId', description: 'Stored attachment identifier.' },
      { name: 'size', description: 'PDF size in bytes.' },
      { name: 'width', description: 'PDF width.' },
      { name: 'height', description: 'PDF height.' },
      {
        name: 'placeholder',
        description: 'Upload placeholder state.',
        transient: true,
      },
    ],
  }),
  node('status', 'Inline status badge.', {
    blockAddressable: false,
    attributes: [
      { name: 'text', description: 'Status label.', required: true },
      {
        name: 'color',
        description: 'Status color.',
        validation: 'gray, blue, green, yellow, red, or purple',
      },
    ],
  }),
  mark('strike', 'Strikethrough inline text.'),
  node('subpages', 'Child pages list.', {
    blockAddressable: false,
    attributes: [],
  }),
  mark('subscript', 'Subscript inline text.'),
  mark('superscript', 'Superscript inline text.'),
  node('table', 'Table container.', {
    blockAddressable: false,
    attributes: [],
  }),
  node('taskList', 'Task checklist.', {
    blockAddressable: false,
    attributes: [],
  }),
  mark('textStyle', 'Inline text style container.', [
    { name: 'color', description: 'Text color.' },
  ]),
  node('transclusionReference', 'Reference to reusable page content.', {
    blockAddressable: false,
    attributes: [
      {
        name: 'sourcePageId',
        description: 'Source page identifier.',
        required: true,
      },
      {
        name: 'transclusionId',
        description: 'Source block identifier.',
        required: true,
      },
    ],
  }),
  node('transclusionSource', 'Reusable page content source block.', {
    blockAddressable: true,
    attributes: [
      {
        name: 'id',
        description: 'Persistent block identifier.',
        required: true,
      },
    ],
  }),
  mark('underline', 'Underlined inline text.'),
  node('video', 'Embedded video player.', {
    blockAddressable: false,
    attributes: [
      { name: 'src', description: 'Video URL.', required: true },
      { name: 'alt', description: 'Video alternative text.' },
      { name: 'attachmentId', description: 'Stored attachment identifier.' },
      { name: 'width', description: 'Video width.' },
      { name: 'height', description: 'Video height.' },
      { name: 'size', description: 'Video size in bytes.' },
      { name: 'align', description: 'Video alignment.' },
      { name: 'aspectRatio', description: 'Video aspect ratio.' },
      {
        name: 'placeholder',
        description: 'Upload placeholder state.',
        transient: true,
      },
    ],
  }),
  node('youtube', 'YouTube video embed.', {
    blockAddressable: false,
    attributes: [
      { name: 'src', description: 'YouTube URL.', required: true },
      { name: 'width', description: 'Embed width.' },
      { name: 'height', description: 'Embed height.' },
      { name: 'start', description: 'Playback start time in seconds.' },
    ],
  }),
] as const satisfies readonly RichContentCapability[];

export const agentAddressableNodeTypes = richContentCapabilities
  .filter(
    (
      capability,
    ): capability is RichContentCapability & {
      category: 'node';
      blockAddressable: true;
    } => capability.category === 'node' && capability.blockAddressable,
  )
  .map((capability) => capability.name);
