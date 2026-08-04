import { Injectable } from '@nestjs/common';
import type { JSONContent } from '@tiptap/core';
import { prosemirrorToAgentMarkdown } from '@docmost/editor-ext';
import { tiptapExtensions } from '../../../collaboration/collaboration.util';
import type { RichContentSnapshot } from '../../../collaboration/rich-content/rich-content.types';
import {
  richContentCapabilities,
  type RichContentCapabilityOperation,
} from '../../../core/rich-content/rich-content-capabilities';

export interface McpPageBlock {
  id: string;
  type: string;
  path: number[];
  attrs: Record<string, unknown>;
  content?: JSONContent[];
  operations: readonly RichContentCapabilityOperation[];
}

export interface McpPageContent {
  revision: string;
  content: string;
  blocks: McpPageBlock[];
}

const readableNodeTypes = new Map(
  richContentCapabilities
    .filter((capability) => capability.category === 'node')
    .map((capability) => [capability.name, capability]),
);

@Injectable()
export class ContentReaderService {
  read(snapshot: RichContentSnapshot): McpPageContent {
    const blocks: McpPageBlock[] = [];
    this.collectBlocks(snapshot.content, snapshot.revision, [], blocks);

    return {
      revision: snapshot.revision,
      content: prosemirrorToAgentMarkdown(snapshot.content, tiptapExtensions),
      blocks,
    };
  }

  private collectBlocks(
    node: JSONContent,
    revision: string,
    path: number[],
    blocks: McpPageBlock[],
  ): void {
    const capability = node.type ? readableNodeTypes.get(node.type) : undefined;
    if (capability) {
      const attrs = { ...(node.attrs ?? {}) };
      const persistentId = typeof attrs.id === 'string' && attrs.id;
      blocks.push({
        id: persistentId || `legacy:${revision}:${path.join('.')}`,
        type: node.type!,
        path: [...path],
        attrs,
        ...(node.content ? { content: structuredClone(node.content) } : {}),
        operations: [...capability.operations],
      });
    }

    node.content?.forEach((child, index) =>
      this.collectBlocks(child, revision, [...path, index], blocks),
    );
  }
}
