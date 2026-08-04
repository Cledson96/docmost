import * as Y from 'yjs';
import { getSchema, type JSONContent } from '@tiptap/core';
import { prosemirrorNodeToYElement, tiptapExtensions } from '../collaboration.util';
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
const schema = getSchema(tiptapExtensions);

export function applyBlockOperations(doc: Y.Doc, input: ApplyBlockOperationsInput): void {
  if (input.expectedRevision && input.expectedRevision !== revisionForDocument(doc)) {
    throw new BlockOperationError('STALE_REVISION', 'The page revision is stale');
  }
  const revision = revisionForDocument(doc);
  for (const operation of input.operations) {
    for (const locator of [operation.target, ...(operation.type === 'move' ? [operation.destination] : [])]) {
      const match = /^legacy:([^:]+):/.exec(locator);
      if (match && match[1] !== revision) throw new BlockOperationError('STALE_REVISION', 'The legacy block locator is stale');
    }
  }
  validateBatch(doc, input.operations);
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
    const container = target.node;
    if (!operation.content.every((node) => canContain(node, container))) throw invalid('Only element blocks can contain a range');
    if (!Number.isInteger(operation.from) || !Number.isInteger(operation.to) || operation.from < 0 || operation.to < operation.from || operation.to > target.node.length) throw invalid('Invalid replacement range');
    const nodes = operation.content.map(validateAndConvert);
    target.node.delete(operation.from, operation.to - operation.from);
    target.node.insert(operation.from, nodes);
    return;
  }
  if (operation.type === 'move') {
    const destination = locate(fragment, operation.destination);
    if (!destination) throw new BlockOperationError('BLOCK_NOT_FOUND', `Block '${operation.destination}' was not found`);
    const node = cloneYNode(target.node);
    const sameParent = target.parent === destination.parent;
    const destinationIndex = destination.index;
    target.parent.delete(target.index, 1);
    const currentDestination = locate(fragment, operation.destination);
    if (!currentDestination) throw new BlockOperationError('BLOCK_NOT_FOUND', `Block '${operation.destination}' was not found`);
    const position = operation.position ?? 'after';
    if (position === 'in') {
      if (!(currentDestination.node instanceof Y.XmlElement) || !canContainYNode(currentDestination.node, node)) throw invalid('Destination cannot contain blocks');
      currentDestination.node.insert(currentDestination.node.length, [node]);
    } else {
      const shifted = sameParent && target.index < destinationIndex ? destinationIndex - 1 : destinationIndex;
      const index = shifted + (position === 'after' ? 1 : 0);
      currentDestination.parent.insert(index, [node]);
    }
    return;
  }
  const node = validateAndConvert(operation.content);
  if (operation.type === 'insertIn') {
    if (!(target.node instanceof Y.XmlElement) || !canContain(operation.content, target.node)) throw invalid('Target cannot contain blocks');
    target.node.insert(target.node.length, [node]);
  } else target.parent.insert(target.index + (operation.type === 'insertAfter' ? 1 : 0), [node]);
}

function validateAndConvert(content: JSONContent) {
  return prosemirrorNodeToYElement(content);
}

function validateBatch(doc: Y.Doc, operations: BlockOperation[]) {
  const ids = new Set<string>();
  for (const id of collectIds(doc.getXmlFragment('default'))) {
    if (ids.has(id)) throw new BlockOperationError('DUPLICATE_BLOCK_ID', `Duplicate existing block id '${id}'`);
    ids.add(id);
  }
  for (const operation of operations) {
    if (!['insertBefore', 'insertAfter', 'insertIn', 'update', 'move', 'delete', 'replaceRange'].includes(operation.type)) throw invalid('Unsupported operation');
    if ('content' in operation && !Array.isArray(operation.content)) {
      validateNode(operation.content, ids);
    }
    if (operation.type === 'replaceRange') operation.content.forEach((node) => validateNode(node, ids));
    if (operation.type === 'update') {
      const target = locate(doc.getXmlFragment('default'), operation.target);
      if (!target || !(target.node instanceof Y.XmlElement)) continue;
      const capability = capabilities.get(target.node.nodeName);
      for (const [name, value] of Object.entries(operation.attrs)) {
        const attr = capability?.attributes.find((item) => item.name === name);
        if (!attr || (name === 'id' && typeof value !== 'string')) throw new BlockOperationError('INVALID_BLOCK_SCHEMA', `Invalid attribute '${name}'`);
      }
      if (typeof operation.attrs.id === 'string') {
        const currentId = target.node.getAttribute('id');
        if (currentId) ids.delete(currentId);
        if (ids.has(operation.attrs.id)) throw new BlockOperationError('DUPLICATE_BLOCK_ID', `Duplicate block id '${operation.attrs.id}'`);
        ids.add(operation.attrs.id);
      }
    }
  }
}

function validateNode(content: JSONContent, ids: Set<string>) {
  if (content.type === 'text') {
    if (typeof content.text !== 'string') throw new BlockOperationError('INVALID_BLOCK_SCHEMA', 'Text nodes require text');
    for (const mark of content.marks ?? []) {
      const capability = capabilities.get(mark.type);
      if (!capability || capability.category !== 'mark') throw new BlockOperationError('INVALID_BLOCK_SCHEMA', `Unsupported mark '${mark.type}'`);
    }
    return;
  }
  const capability = content.type ? capabilities.get(content.type) : undefined;
  if (!capability || content.type === 'doc') throw new BlockOperationError('INVALID_BLOCK_SCHEMA', `Unsupported block type '${content.type ?? ''}'`);
  const attributes = content.attrs ?? {};
  for (const attr of capability.attributes) {
    if (attr.required && (attributes[attr.name] === undefined || attributes[attr.name] === null)) throw new BlockOperationError('INVALID_BLOCK_SCHEMA', `Missing required attribute '${attr.name}'`);
  }
  for (const [name, value] of Object.entries(attributes)) {
    const attr = capability.attributes.find((item) => item.name === name);
    if (!attr || (name === 'id' && typeof value !== 'string')) throw new BlockOperationError('INVALID_BLOCK_SCHEMA', `Invalid attribute '${name}'`);
  }
  const id = attributes.id;
  if (typeof id === 'string') {
    if (ids.has(id)) throw new BlockOperationError('DUPLICATE_BLOCK_ID', `Duplicate block id '${id}'`);
    ids.add(id);
  }
  content.content?.forEach((child) => validateNode(child, ids));
}

function collectIds(parent: Y.XmlFragment | Y.XmlElement): string[] {
  return parent.toArray().flatMap((node) => node instanceof Y.XmlElement
    ? [node.getAttribute('id'), ...collectIds(node)].filter((id): id is string => typeof id === 'string')
    : []);
}

function cloneYNode(node: Y.XmlElement | Y.XmlText): Y.XmlElement | Y.XmlText {
  if (node instanceof Y.XmlText) {
    const copy = new Y.XmlText();
    let index = 0;
    for (const part of node.toDelta()) {
      const text = typeof part.insert === 'string' ? part.insert : '';
      copy.insert(index, text, part.attributes);
      index += text.length;
    }
    return copy;
  }
  const copy = new Y.XmlElement(node.nodeName);
  for (const [key, value] of Object.entries(node.getAttributes())) copy.setAttribute(key, value as any);
  copy.insert(0, node.toArray().map((child) => cloneYNode(child as Y.XmlElement | Y.XmlText)));
  return copy;
}

function canContain(content: JSONContent, parent: Y.XmlElement): boolean {
  const parentType = schema.nodes[parent.nodeName];
  const childType = content.type ? schema.nodes[content.type] : undefined;
  return Boolean(parentType && childType && parentType.contentMatch.matchType(childType));
}
function canContainYNode(parent: Y.XmlElement, child: Y.XmlElement | Y.XmlText): boolean {
  return child instanceof Y.XmlText ? canContain({ type: 'text', text: child.toString() }, parent) : canContain({ type: child.nodeName }, parent);
}

function locate(parent: Y.XmlFragment | Y.XmlElement, locator: string, path: number[] = []): Located | undefined {
  const legacy = /^legacy:([^:]+):(.+)$/.exec(locator);
  for (const [index, node] of parent.toArray().entries()) {
    const currentPath = path.concat(index).join('.');
    if (node instanceof Y.XmlElement && (node.getAttribute('id') === locator || (legacy?.[2] === currentPath && !node.getAttribute('id')))) return { node, parent, index };
    if (node instanceof Y.XmlElement) {
      const nested = locate(node, locator, path.concat(index));
      if (nested) return nested;
    }
  }
}
function invalid(message: string) { return new BlockOperationError('INVALID_OPERATION', message); }
