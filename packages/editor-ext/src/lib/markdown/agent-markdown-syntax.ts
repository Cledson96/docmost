export type AgentMarkdownSyntax =
  | 'standard'
  | 'block-directive'
  | 'inline-directive';

export const agentMarkdownStandardNodeTypes = new Set([
  'doc',
  'text',
  'paragraph',
  'heading',
  'blockquote',
  'bulletList',
  'orderedList',
  'listItem',
  'taskList',
  'taskItem',
  'codeBlock',
  'hardBreak',
  'horizontalRule',
  'table',
  'tableRow',
  'tableCell',
  'tableHeader',
]);
export const agentMarkdownStandardMarkTypes = new Set([
  'bold',
  'italic',
  'strike',
  'code',
  'link',
]);
export const agentMarkdownInlineNodeTypes = new Set([
  'mention',
  'status',
  'mathInline',
]);
export const agentMarkdownInlineMarkTypes = new Set([
  'underline',
  'superscript',
  'subscript',
  'highlight',
  'textStyle',
]);

export function agentMarkdownSyntaxFor(type: string): AgentMarkdownSyntax {
  if (
    agentMarkdownStandardNodeTypes.has(type) ||
    agentMarkdownStandardMarkTypes.has(type)
  )
    return 'standard';
  if (
    agentMarkdownInlineNodeTypes.has(type) ||
    agentMarkdownInlineMarkTypes.has(type)
  )
    return 'inline-directive';
  return 'block-directive';
}
