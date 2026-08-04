import { Injectable, NotFoundException } from '@nestjs/common';
import type { JSONContent } from '@tiptap/core';
import { agentMarkdownToProsemirror } from '@docmost/editor-ext';
import type { Page, User, Workspace } from '@docmost/db/types/entity.types';
import { PageRepo } from '@docmost/db/repos/page/page.repo';
import { PageAccessService } from '../../../core/page/page-access/page-access.service';
import { CollaborationGateway } from '../../../collaboration/collaboration.gateway';
import { tiptapExtensions } from '../../../collaboration/collaboration.util';
import type { BlockOperation } from '../../../collaboration/rich-content/block-operations';

const MAX_OPERATIONS = 50;
const MAX_AGENT_MARKDOWN_LENGTH = 1_000_000;

export class BlockEditRequestError extends Error {
  constructor(
    public readonly code: 'INVALID_REQUEST' | 'TOO_MANY_OPERATIONS',
    message: string,
  ) {
    super(message);
  }
}

type RawOperation = Record<string, unknown>;

@Injectable()
export class BlockEditService {
  constructor(
    private readonly pageRepo: PageRepo,
    private readonly pageAccessService: PageAccessService,
    private readonly collaborationGateway: CollaborationGateway,
  ) {}

  async edit(input: unknown, user: User, workspace: Workspace) {
    const request = this.validateRequest(input);
    const page = await this.getPageInWorkspace(request.pageId, workspace);
    await this.pageAccessService.validateCanEdit(page, user);

    const operations = await Promise.all(
      request.operations.map((operation) => this.normalizeOperation(operation)),
    );
    await this.assertCanAccessReferencedPages(operations, user, workspace);
    const snapshot = await this.collaborationGateway.handleYjsEvent(
      'editPageBlocks',
      `page.${page.id}`,
      {
        ...(request.expectedRevision
          ? { expectedRevision: request.expectedRevision }
          : {}),
        operations: operations as BlockOperation[],
        user,
      },
    );

    return { pageId: page.id, revision: snapshot!.revision };
  }

  private async getPageInWorkspace(
    pageId: string,
    workspace: Workspace,
  ): Promise<Page> {
    const page = await this.pageRepo.findById(pageId);
    if (!page || page.deletedAt || page.workspaceId !== workspace.id) {
      throw new NotFoundException('Page not found');
    }
    return page;
  }

  private validateRequest(input: unknown): {
    pageId: string;
    expectedRevision?: string;
    operations: RawOperation[];
  } {
    if (!this.isRecord(input)) this.invalid('Request must be an object');
    this.rejectUnknown(input, ['pageId', 'expectedRevision', 'operations']);
    this.rejectResolved(input);
    if (typeof input.pageId !== 'string' || !input.pageId) {
      this.invalid('pageId is required');
    }
    if (typeof input.expectedRevision !== 'string' || !input.expectedRevision) {
      this.invalid('expectedRevision is required');
    }
    if (!Array.isArray(input.operations))
      this.invalid('operations must be an array');
    if (input.operations.length > MAX_OPERATIONS) {
      throw new BlockEditRequestError(
        'TOO_MANY_OPERATIONS',
        `A maximum of ${MAX_OPERATIONS} operations is allowed`,
      );
    }
    if (!input.operations.every(this.isRecord))
      this.invalid('Each operation must be an object');
    return input as {
      pageId: string;
      expectedRevision?: string;
      operations: RawOperation[];
    };
  }

  private async normalizeOperation(
    operation: RawOperation,
  ): Promise<Record<string, unknown>> {
    this.rejectResolved(operation);
    const type = operation.type;
    if (typeof type !== 'string') this.invalid('Operation type is required');

    const fields: Record<string, readonly string[]> = {
      insertBefore: ['type', 'target', 'content'],
      insertAfter: ['type', 'target', 'content'],
      insertIn: ['type', 'target', 'content'],
      update: ['type', 'target', 'attrs'],
      move: ['type', 'target', 'destination', 'position'],
      delete: ['type', 'target'],
      replaceRange: ['type', 'target', 'from', 'to', 'content'],
    };
    const allowed = fields[type];
    if (!allowed) this.invalid(`Unsupported operation '${type}'`);
    this.rejectUnknown(operation, allowed);
    if (typeof operation.target !== 'string' || !operation.target)
      this.invalid('Operation target is required');

    if (type === 'move') {
      if (typeof operation.destination !== 'string' || !operation.destination)
        this.invalid('Move destination is required');
      if (
        operation.position !== undefined &&
        !['before', 'after', 'in'].includes(operation.position as string)
      )
        this.invalid('Invalid move position');
      return operation;
    }
    if (type === 'update') {
      if (!this.isRecord(operation.attrs))
        this.invalid('update attrs must be an object');
      return operation;
    }
    if (type === 'delete') return operation;

    if (typeof operation.content !== 'string')
      this.invalid('Operation content must be Agent Markdown');
    if (operation.content.length > MAX_AGENT_MARKDOWN_LENGTH) {
      this.invalid(
        `Operation content cannot exceed ${MAX_AGENT_MARKDOWN_LENGTH} characters`,
      );
    }
    const content = await agentMarkdownToProsemirror(
      operation.content,
      tiptapExtensions,
    );
    if (type === 'replaceRange') {
      if (!Number.isInteger(operation.from) || !Number.isInteger(operation.to))
        this.invalid('replaceRange requires integer from and to');
      return { ...operation, content: content.content ?? [] };
    }
    if (content.content?.length !== 1)
      this.invalid(
        'Insert operations require exactly one block of Agent Markdown',
      );
    return { ...operation, content: content.content[0] as JSONContent };
  }

  private async assertCanAccessReferencedPages(
    operations: Record<string, unknown>[],
    user: User,
    workspace: Workspace,
  ) {
    const pageIds = new Set<string>();
    const collect = (value: unknown) => {
      if (Array.isArray(value)) {
        value.forEach(collect);
        return;
      }
      if (!this.isRecord(value)) return;
      if (typeof value.pageId === 'string') pageIds.add(value.pageId);
      if (typeof value.sourcePageId === 'string')
        pageIds.add(value.sourcePageId);
      if (value.entityType === 'page' && typeof value.entityId === 'string') {
        pageIds.add(value.entityId);
      }
      Object.values(value).forEach(collect);
    };
    operations.forEach((operation) => {
      collect(operation.attrs);
      collect(operation.content);
    });

    for (const pageId of pageIds) {
      const reference = await this.getPageInWorkspace(pageId, workspace);
      await this.pageAccessService.validateCanView(reference, user);
    }
  }

  private rejectUnknown(
    value: Record<string, unknown>,
    allowed: readonly string[],
  ) {
    const unknown = Object.keys(value).find((key) => !allowed.includes(key));
    if (unknown) this.invalid(`Unknown field '${unknown}'`);
  }

  private rejectResolved(value: Record<string, unknown>) {
    if (Object.prototype.hasOwnProperty.call(value, 'resolved')) {
      this.invalid("Client-provided 'resolved' is not allowed");
    }
  }

  private isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
  }

  private invalid(message: string): never {
    throw new BlockEditRequestError('INVALID_REQUEST', message);
  }
}
