import * as Y from 'yjs';
import { TiptapTransformer } from '@hocuspocus/transformer';
import { tiptapExtensions } from '../collaboration.util';
import { applyBlockOperations, BlockOperationError } from './block-operations';

function documentWith(content: any[]) {
  return TiptapTransformer.toYdoc({ type: 'doc', content }, 'default', tiptapExtensions);
}

describe('applyBlockOperations', () => {
  it('inserts after a top-level block without replacing untouched sibling identity', () => {
    const doc = documentWith([{ type: 'paragraph', attrs: { id: 'one' } }, { type: 'paragraph', attrs: { id: 'two' } }]);
    const fragment = doc.getXmlFragment('default');
    const untouched = fragment.get(1);

    applyBlockOperations(doc, { operations: [{ type: 'insertAfter', target: 'one', content: { type: 'paragraph', attrs: { id: 'new' } } }] });

    expect(fragment.toArray().map((node: any) => node.getAttribute('id'))).toEqual(['one', 'new', 'two']);
    expect(fragment.get(2)).toBe(untouched);
  });

  it('rolls back the entire batch when a later operation is invalid', () => {
    const doc = documentWith([{ type: 'paragraph', attrs: { id: 'one' } }]);
    expect(() => applyBlockOperations(doc, { operations: [
      { type: 'insertAfter', target: 'one', content: { type: 'paragraph', attrs: { id: 'new' } } },
      { type: 'delete', target: 'missing' },
    ] })).toThrow(BlockOperationError);
    expect(doc.getXmlFragment('default').toArray().map((node: any) => node.getAttribute('id'))).toEqual(['one']);
  });
});
