/**
 * Block node types that receive persistent `id` attributes from UniqueID.
 * This is shared by every writable and read-only editor schema.
 */
export const uniqueIdNodeTypes = [
  'heading',
  'paragraph',
  'transclusionSource',
] as const;
