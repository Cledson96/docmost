import type { JSONContent } from '@tiptap/core';

export interface RichContentSnapshot {
  revision: string;
  content: JSONContent;
}
