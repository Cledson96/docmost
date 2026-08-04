export type RichContentCapabilityCategory = 'node' | 'mark';

export interface RichContentAttribute {
  name: string;
  description: string;
  required?: boolean;
  validation?: string;
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
    ],
  }),
  node('audio', 'Embedded audio player.', {
    blockAddressable: false,
    attributes: [{ name: 'src', description: 'Audio URL.', required: true }],
  }),
  node('base', 'Embedded Docmost base.', {
    blockAddressable: false,
    attributes: [
      { name: 'pageId', description: 'Base page identifier.', required: true },
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
    attributes: [{ name: 'type', description: 'Callout variant.' }],
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
    attributes: [],
  }),
  node('details', 'Collapsible details block.', {
    blockAddressable: false,
    attributes: [
      { name: 'open', description: 'Whether details are expanded.' },
    ],
  }),
  node('drawio', 'Draw.io diagram embed.', {
    blockAddressable: false,
    attributes: [{ name: 'src', description: 'Diagram URL.', required: true }],
  }),
  node('embed', 'External embed block.', {
    blockAddressable: false,
    attributes: [{ name: 'src', description: 'Embed URL.', required: true }],
  }),
  node('excalidraw', 'Excalidraw diagram embed.', {
    blockAddressable: false,
    attributes: [{ name: 'src', description: 'Diagram URL.', required: true }],
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
    ],
  }),
  mark('highlight', 'Highlighted inline text.', [
    { name: 'color', description: 'Highlight color.' },
  ]),
  node('horizontalRule', 'Horizontal divider.', {
    blockAddressable: false,
    attributes: [],
  }),
  node('image', 'Embedded image.', {
    blockAddressable: false,
    attributes: [{ name: 'src', description: 'Image URL.', required: true }],
  }),
  mark('italic', 'Italic inline text.'),
  mark('link', 'Hyperlink inline text.', [
    { name: 'href', description: 'Destination URL.', required: true },
    { name: 'target', description: 'Link target.' },
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
    ],
  }),
  node('orderedList', 'Numbered list.', {
    blockAddressable: false,
    attributes: [],
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
    ],
  }),
  node('pdf', 'Embedded PDF document.', {
    blockAddressable: false,
    attributes: [{ name: 'src', description: 'PDF URL.', required: true }],
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
  mark('textStyle', 'Inline text style container.'),
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
    attributes: [{ name: 'src', description: 'Video URL.', required: true }],
  }),
  node('youtube', 'YouTube video embed.', {
    blockAddressable: false,
    attributes: [{ name: 'src', description: 'YouTube URL.', required: true }],
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
