import * as Y from 'yjs';
import { TiptapTransformer } from '@hocuspocus/transformer';
import { tiptapExtensions } from '../collaboration.util';
import { applyBlockOperations, BlockOperationError } from './block-operations';
import { revisionForDocument } from './rich-content-yjs.util';

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

  it('edits nested content in place and moves it without replacing untouched siblings', () => {
    const doc = documentWith([{ type: 'blockquote', attrs: { id: 'parent' }, content: [
      { type: 'paragraph', attrs: { id: 'nested' } }, { type: 'paragraph', attrs: { id: 'stay' } },
    ] }]);
    const parent: any = doc.getXmlFragment('default').get(0);
    const stay = parent.get(1);
    applyBlockOperations(doc, { operations: [
      { type: 'update', target: 'nested', attrs: { textAlign: 'center' } },
      { type: 'replaceRange', target: 'legacy:0', from: 0, to: 1, content: [{ type: 'paragraph', attrs: { id: 'replacement' } }] },
      { type: 'move', target: 'replacement', destination: 'stay', position: 'after' },
    ] });
    expect(parent.get(0)).toBe(stay);
    expect(parent.get(1).getAttribute('id')).toBe('replacement');
  });

  it('rejects stale, duplicate, unsupported, invalid-container and malformed-schema operations with typed failures', () => {
    const doc = documentWith([{ type: 'paragraph', attrs: { id: 'one' } }]);
    const expectCode = (input: any, code: string) => expect(() => applyBlockOperations(doc, input)).toThrow(expect.objectContaining({ code }));
    expectCode({ expectedRevision: 'stale', operations: [] }, 'STALE_REVISION');
    expectCode({ operations: [{ type: 'insertAfter', target: 'one', content: { type: 'paragraph', attrs: { id: 'one' } } }] }, 'DUPLICATE_BLOCK_ID');
    expectCode({ operations: [{ type: 'insertAfter', target: 'one', content: { type: 'unknown' } }] }, 'INVALID_BLOCK_SCHEMA');
    expectCode({ operations: [{ type: 'insertIn', target: 'one', content: { type: 'paragraph', attrs: { id: 'inside' } } }] }, 'INVALID_OPERATION');
    expectCode({ operations: [{ type: 'update', target: 'one', attrs: { id: 2 } }] }, 'INVALID_BLOCK_SCHEMA');
    expect(revisionForDocument(doc)).toBe(revisionForDocument(doc));
  });

  it('promotes a legacy locator to an id and rejects missing targets without changing the document', () => {
    const doc = documentWith([{ type: 'paragraph' }]);
    applyBlockOperations(doc, { operations: [{ type: 'update', target: 'legacy:0', attrs: { id: 'promoted' } }] });
    expect((doc.getXmlFragment('default').get(0) as any).getAttribute('id')).toBe('promoted');
    expect(() => applyBlockOperations(doc, { operations: [{ type: 'delete', target: 'missing' }] })).toThrow(expect.objectContaining({ code: 'BLOCK_NOT_FOUND' }));
  });
});
