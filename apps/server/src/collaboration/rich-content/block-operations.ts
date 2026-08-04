import * as Y from 'yjs';
import type { JSONContent } from '@tiptap/core';
import { prosemirrorNodeToYElement } from '../collaboration.util';
import { revisionForDocument } from './rich-content-yjs.util';
import { richContentCapabilities } from '../../core/rich-content/rich-content-capabilities';

export type BlockOperation =
  | { type: 'insertBefore' | 'insertAfter' | 'insertIn'; target: string; content: JSONContent }
  | { type: 'update'; target: string; attrs: Record<string, unknown> }
  | { type: 'move'; target: string; destination: string; position?: 'before' | 'after' | 'in' }
  | { type: 'delete'; target: string }
  | { type: 'replaceRange'; target: string; from: number; to: number; content: JSONContent[] };

export type ApplyBlockOperationsInput = { expectedRevision?: string; operations: BlockOperation[] };

export type BlockOperationErrorCode =
  | 'STALE_REVISION' | 'BLOCK_NOT_FOUND' | 'DUPLICATE_BLOCK_ID' | 'INVALID_OPERATION' | 'INVALID_BLOCK_SCHEMA';

export class BlockOperationError extends Error {
  constructor(public readonly code: BlockOperationErrorCode, message: string) { super(message); }
}

type Located = { node: Y.XmlElement | Y.XmlText; parent: Y.XmlFragment | Y.XmlElement; index: number };
const capabilities = new Map(richContentCapabilities.map((item) => [item.name, item]));

export function applyBlockOperations(doc: Y.Doc, input: ApplyBlockOperationsInput): void {
  if (input.expectedRevision && input.expectedRevision !== revisionForDocument(doc)) {
    throw new BlockOperationError('STALE_REVISION', 'The page revision is stale');
  }
  // Preflight in an isolated Y.Doc: a rejected later operation never changes the live document.
  const trial = new Y.Doc();
  Y.applyUpdate(trial, Y.encodeStateAsUpdate(doc));
  applyAll(trial, input.operations);
  applyAll(doc, input.operations);
}

function applyAll(doc: Y.Doc, operations: BlockOperation[]) {
  doc.transact(() => operations.forEach((operation) => applyOne(doc, operation)));
}

function applyOne(doc: Y.Doc, operation: BlockOperation) {
  const fragment = doc.getXmlFragment('default');
  const target = locate(fragment, operation.target);
  if (!target) throw new BlockOperationError('BLOCK_NOT_FOUND', `Block '${operation.target}' was not found`);
  if (operation.type === 'delete') return target.parent.delete(target.index, 1);
  if (operation.type === 'update') {
    if (!(target.node instanceof Y.XmlElement)) throw invalid('Only element blocks can be updated');
    for (const [key, value] of Object.entries(operation.attrs)) target.node.setAttribute(key, value as any);
    return;
  }
  if (operation.type === 'replaceRange') {
    if (!(target.node instanceof Y.XmlElement)) throw invalid('Only element blocks can contain a range');
    if (!Number.isInteger(operation.from) || !Number.isInteger(operation.to) || operation.from < 0 || operation.to < operation.from || operation.to > target.node.length) throw invalid('Invalid replacement range');
    const nodes = operation.content.map(validateAndConvert);
    target.node.delete(operation.from, operation.to - operation.from);
    target.node.insert(operation.from, nodes);
    return;
  }
  if (operation.type === 'move') {
    const destination = locate(fragment, operation.destination);
    if (!destination) throw new BlockOperationError('BLOCK_NOT_FOUND', `Block '${operation.destination}' was not found`);
    const node = target.node;
    target.parent.delete(target.index, 1);
    const position = operation.position ?? 'after';
    if (position === 'in') {
      if (!(destination.node instanceof Y.XmlElement)) throw invalid('Destination cannot contain blocks');
      destination.node.insert(destination.node.length, [node]);
    } else {
      const index = destination.index + (position === 'after' ? 1 : 0);
      destination.parent.insert(index, [node]);
    }
    return;
  }
  const node = validateAndConvert(operation.content);
  if (operation.type === 'insertIn') {
    if (!(target.node instanceof Y.XmlElement)) throw invalid('Target cannot contain blocks');
    target.node.insert(target.node.length, [node]);
  } else target.parent.insert(target.index + (operation.type === 'insertAfter' ? 1 : 0), [node]);
}

function validateAndConvert(content: JSONContent) {
  if (!content.type || content.type === 'doc' || !capabilities.has(content.type)) throw invalid(`Unsupported block type '${content.type ?? ''}'`);
  const id = content.attrs?.id;
  if (id !== undefined && typeof id !== 'string') throw new BlockOperationError('DUPLICATE_BLOCK_ID', 'Block id must be a string');
  return prosemirrorNodeToYElement(content);
}

function locate(parent: Y.XmlFragment | Y.XmlElement, locator: string, path: number[] = []): Located | undefined {
  for (const [index, node] of parent.toArray().entries()) {
    if (node instanceof Y.XmlElement && (node.getAttribute('id') === locator || locator === `legacy:${path.concat(index).join('.')}`)) return { node, parent, index };
    if (node instanceof Y.XmlElement) {
      const nested = locate(node, locator, path.concat(index));
      if (nested) return nested;
    }
  }
}
function invalid(message: string) { return new BlockOperationError('INVALID_OPERATION', message); }
