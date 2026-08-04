import { Injectable } from '@nestjs/common';
import type { JSONContent } from '@tiptap/core';
import type { Page, User } from '@docmost/db/types/entity.types';
import { PageRepo } from '@docmost/db/repos/page/page.repo';
import { PageService } from '../../../core/page/services/page.service';
import { PageAccessService } from '../../../core/page/page-access/page-access.service';
import { BaseService } from '../../base/base.service';
import { TransclusionService } from '../../../core/page/transclusion/transclusion.service';
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
  resolved?: unknown;
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

const DEFAULT_DYNAMIC_LIMIT = 20;
const MAX_DYNAMIC_LIMIT = 100;
const MAX_DYNAMIC_DEPTH = 5;

type DynamicReadContext = {
  page: Pick<Page, 'id' | 'spaceId'>;
  user: User;
  workspaceId: string;
};

@Injectable()
export class ContentReaderService {
  constructor(
    private readonly pageService?: PageService,
    private readonly pageRepo?: PageRepo,
    private readonly pageAccessService?: PageAccessService,
    private readonly baseService?: BaseService,
    private readonly transclusionService?: TransclusionService,
  ) {}

  read(snapshot: RichContentSnapshot): McpPageContent {
    const blocks: McpPageBlock[] = [];
    this.collectBlocks(snapshot.content, snapshot.revision, [], blocks);

    return {
      revision: snapshot.revision,
      content: prosemirrorToAgentMarkdown(snapshot.content, tiptapExtensions),
      blocks,
    };
  }

  async readResolved(
    snapshot: RichContentSnapshot,
    context: DynamicReadContext,
  ): Promise<McpPageContent> {
    const content = this.read(snapshot);
    const blocks = await Promise.all(
      content.blocks.map(async (block) => ({
        ...block,
        ...(this.isDynamicBlock(block.type)
          ? { resolved: await this.resolveBlock(block, context) }
          : {}),
      })),
    );
    return { ...content, blocks };
  }

  private isDynamicBlock(type: string): boolean {
    return (
      type === 'subpages' || type === 'base' || type === 'transclusionReference'
    );
  }

  private async resolveBlock(
    block: McpPageBlock,
    context: DynamicReadContext,
  ): Promise<unknown> {
    try {
      switch (block.type) {
        case 'subpages':
          return await this.resolveSubpages(block, context);
        case 'base':
          return await this.resolveBase(block, context);
        case 'transclusionReference':
          return await this.resolveTransclusion(block, context);
      }
    } catch (error) {
      return this.dynamicFailure(block.type, error);
    }
  }

  private async resolveSubpages(
    block: McpPageBlock,
    context: DynamicReadContext,
  ) {
    const limit = this.dynamicLimit(block.attrs.limit);
    const depth = this.dynamicDepth(block.attrs.depth);
    if (!this.pageService)
      return this.dynamicFailure('subpages', 'Dynamic resolver unavailable');
    return this.readChildren(context.page.id, context, limit, depth, new Set());
  }

  private async readChildren(
    parentPageId: string,
    context: DynamicReadContext,
    limit: number,
    depth: number,
    ancestors: Set<string>,
  ): Promise<unknown> {
    if (ancestors.has(parentPageId)) {
      return this.dynamicFailure('subpages', 'Page tree cycle detected');
    }
    if (depth < 1) {
      return this.dynamicFailure(
        'subpages',
        `Maximum dynamic depth of ${MAX_DYNAMIC_DEPTH} reached`,
      );
    }
    const result = await this.pageService!.getSidebarPages(
      context.page.spaceId,
      { limit, cursor: undefined, query: '', adminView: false },
      parentPageId,
      context.user.id,
      true,
    );
    if (depth === 1) return result;

    const nextAncestors = new Set(ancestors).add(parentPageId);
    return {
      ...result,
      items: await Promise.all(
        result.items.map(async (item: any) => ({
          ...item,
          children: await this.readChildren(
            item.id,
            context,
            limit,
            depth - 1,
            nextAncestors,
          ),
        })),
      ),
    };
  }

  private async resolveBase(
    block: McpPageBlock,
    context: DynamicReadContext,
  ): Promise<unknown> {
    const pageId = this.requiredString(block.attrs.pageId, 'base pageId');
    if (!this.pageRepo || !this.pageAccessService || !this.baseService) {
      return this.dynamicFailure('base', 'Dynamic resolver unavailable');
    }
    const base = await this.pageRepo.findById(pageId);
    if (
      !base ||
      base.workspaceId !== context.workspaceId ||
      base.deletedAt ||
      !base.isBase
    ) {
      return this.dynamicFailure('base', 'Base not found');
    }
    await this.pageAccessService.validateCanView(base, context.user);
    return this.baseService.getBaseInfo(pageId, context.workspaceId);
  }

  private async resolveTransclusion(
    block: McpPageBlock,
    context: DynamicReadContext,
  ): Promise<unknown> {
    const sourcePageId = this.requiredString(
      block.attrs.sourcePageId,
      'sourcePageId',
    );
    const transclusionId = this.requiredString(
      block.attrs.transclusionId,
      'transclusionId',
    );
    if (!this.transclusionService) {
      return this.dynamicFailure(
        'transclusionReference',
        'Dynamic resolver unavailable',
      );
    }
    const { items } = await this.transclusionService.lookup(
      [{ sourcePageId, transclusionId }],
      context.user.id,
      context.workspaceId,
    );
    const item = items[0];
    if (!item)
      return this.dynamicFailure(
        'transclusionReference',
        'Transclusion not found',
      );
    if ('status' in item)
      return this.dynamicFailure('transclusionReference', item.status);
    return item;
  }

  private dynamicLimit(value: unknown): number {
    return typeof value === 'number' && Number.isInteger(value)
      ? Math.max(1, Math.min(value, MAX_DYNAMIC_LIMIT))
      : DEFAULT_DYNAMIC_LIMIT;
  }

  private dynamicDepth(value: unknown): number {
    return typeof value === 'number' && Number.isInteger(value)
      ? Math.max(1, Math.min(value, MAX_DYNAMIC_DEPTH))
      : 1;
  }

  private requiredString(value: unknown, name: string): string {
    if (typeof value !== 'string' || !value)
      throw new Error(`${name} is required`);
    return value;
  }

  private dynamicFailure(type: string, error: unknown) {
    return {
      code: 'DYNAMIC_RESOLUTION_FAILED',
      type,
      message: error instanceof Error ? error.message : String(error),
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
