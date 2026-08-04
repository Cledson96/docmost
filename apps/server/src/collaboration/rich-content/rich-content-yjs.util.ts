import { createHash } from 'node:crypto';
import { TiptapTransformer } from '@hocuspocus/transformer';
import * as Y from 'yjs';
import type { RichContentSnapshot } from './rich-content.types';

export function revisionForDocument(document: Y.Doc): string {
  return createHash('sha256')
    .update(Y.encodeStateVector(document))
    .digest('base64url');
}

export function snapshotDocument(document: Y.Doc): RichContentSnapshot {
  return {
    revision: revisionForDocument(document),
    content: TiptapTransformer.fromYdoc(document, 'default'),
  };
}
