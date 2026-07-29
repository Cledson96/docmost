import {
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { InjectKysely } from 'nestjs-kysely';
import { KyselyDB } from '@docmost/db/types/kysely.types';
import { PageService } from '../../core/page/services/page.service';
import {
  ContentOperation,
  UpdatePageDto,
} from '../../core/page/dto/update-page.dto';
import { ContentFormat } from '../../core/page/dto/create-page.dto';
import { PageAccessService } from '../../core/page/page-access/page-access.service';
import { PageRepo } from '@docmost/db/repos/page/page.repo';
import { PagePermissionRepo } from '@docmost/db/repos/page/page-permission.repo';
import { SpaceMemberRepo } from '@docmost/db/repos/space/space-member.repo';
import SpaceAbilityFactory from '../../core/casl/abilities/space-ability.factory';
import {
  SpaceCaslAction,
  SpaceCaslSubject,
} from '../../core/casl/interfaces/space-ability.type';
import { BaseService } from '../base/base.service';
import { SearchService } from '../../core/search/search.service';
import { SearchDTO } from '../../core/search/dto/search.dto';
import {
  jsonToHtml,
  jsonToMarkdown,
} from '../../collaboration/collaboration.util';
import { Page, User, Workspace } from '@docmost/db/types/entity.types';
import { AuditEvent, AuditResource } from '../../common/events/audit-events';
import {
  AUDIT_SERVICE,
  IAuditService,
} from '../../integrations/audit/audit.service';
import { getPageTitle } from '../../common/helpers';

/** Mirrors BasePropertyType on the client (apps/client/src/ee/base/types/base.types.ts). */
const BASE_PROPERTY_TYPES = [
  'text',
  'longText',
  'number',
  'select',
  'multiSelect',
  'status',
  'date',
  'person',
  'file',
  'page',
  'checkbox',
  'url',
  'email',
  'createdAt',
  'lastEditedAt',
  'lastEditedBy',
  'formula',
];

const BASE_VIEW_TYPES = ['table', 'kanban', 'calendar'];

@Injectable()
export class McpService {
  constructor(
    @InjectKysely() private readonly db: KyselyDB,
    private readonly pageService: PageService,
    private readonly pageRepo: PageRepo,
    private readonly pageAccessService: PageAccessService,
    private readonly pagePermissionRepo: PagePermissionRepo,
    private readonly spaceMemberRepo: SpaceMemberRepo,
    private readonly spaceAbility: SpaceAbilityFactory,
    private readonly baseService: BaseService,
    private readonly searchService: SearchService,
    @Inject(AUDIT_SERVICE) private readonly auditService: IAuditService,
  ) {}

  async handleRpcRequest(body: any, user: User, workspace: Workspace) {
    const { id, method, params } = body || {};

    if (method === 'initialize') {
      return {
        jsonrpc: '2.0',
        id,
        result: {
          protocolVersion: '2024-11-05',
          capabilities: {
            tools: {},
          },
          serverInfo: {
            name: 'Docmost MCP Server',
            version: '1.0.0',
          },
        },
      };
    }

    if (method === 'notifications/initialized') {
      return { jsonrpc: '2.0', id, result: {} };
    }

    if (method === 'tools/list') {
      return {
        jsonrpc: '2.0',
        id,
        result: {
          tools: this.getToolsList(),
        },
      };
    }

    if (method === 'tools/call') {
      const toolName = params?.name;
      const toolArgs = params?.arguments || {};

      try {
        const result = await this.callTool(toolName, toolArgs, user, workspace);
        return {
          jsonrpc: '2.0',
          id,
          result: {
            content: [
              {
                type: 'text',
                text: typeof result === 'string' ? result : JSON.stringify(result, null, 2),
              },
            ],
          },
        };
      } catch (err: any) {
        return {
          jsonrpc: '2.0',
          id,
          result: {
            content: [
              {
                type: 'text',
                text: `Error executing tool '${toolName}': ${this.toToolErrorMessage(err)}`,
              },
            ],
            isError: true,
          },
        };
      }
    }

    return {
      jsonrpc: '2.0',
      id,
      error: {
        code: -32601,
        message: `Method '${method}' not found`,
      },
    };
  }

  /**
   * Permission failures surface as bare ForbiddenException with no message.
   * Give the agent something actionable instead of an empty string.
   */
  private toToolErrorMessage(err: any): string {
    if (err instanceof ForbiddenException) {
      return 'You do not have permission to perform this action.';
    }
    return err?.message || 'Unknown error';
  }

  private getToolsList() {
    return [...this.getPageToolsList(), ...this.getBaseToolsList()];
  }

  private getPageToolsList() {
    return [
      {
        name: 'list_spaces',
        description:
          'List the spaces the authenticated user is a member of in the Docmost workspace.',
        inputSchema: {
          type: 'object',
          properties: {},
        },
      },
      {
        name: 'list_pages',
        description:
          'List pages the authenticated user can access, optionally scoped to a space.',
        inputSchema: {
          type: 'object',
          properties: {
            spaceId: { type: 'string', description: 'Optional space ID filter' },
          },
        },
      },
      {
        name: 'get_page',
        description:
          'Retrieve full content and metadata of a page by pageId or slugId. Content is returned as markdown by default.',
        inputSchema: {
          type: 'object',
          properties: {
            pageId: { type: 'string', description: 'Page ID or slug ID' },
            format: {
              type: 'string',
              enum: ['markdown', 'html', 'json'],
              description:
                'Output format for the content. Defaults to markdown. Use json only when you need the raw ProseMirror document.',
            },
          },
          required: ['pageId'],
        },
      },
      {
        name: 'create_page',
        description: 'Create a new page in a space.',
        inputSchema: {
          type: 'object',
          properties: {
            title: { type: 'string', description: 'Page title' },
            content: { type: 'string', description: 'Markdown content of the page' },
            spaceId: { type: 'string', description: 'Space ID where page will be created' },
            parentPageId: { type: 'string', description: 'Optional parent page ID' },
          },
          required: ['title', 'spaceId'],
        },
      },
      {
        name: 'update_page',
        description: 'Update content or title of an existing page.',
        inputSchema: {
          type: 'object',
          properties: {
            pageId: { type: 'string', description: 'Page ID to update' },
            title: { type: 'string', description: 'Optional new title' },
            content: { type: 'string', description: 'Optional markdown content' },
            operation: {
              type: 'string',
              enum: ['append', 'prepend', 'replace'],
              description: 'Content operation: append (default), prepend, or replace',
            },
          },
          required: ['pageId'],
        },
      },
      {
        name: 'delete_page',
        description: 'Move a page to the trash by pageId.',
        inputSchema: {
          type: 'object',
          properties: {
            pageId: { type: 'string', description: 'Page ID to delete' },
          },
          required: ['pageId'],
        },
      },
      {
        name: 'search_workspace',
        description:
          'Full-text search over page titles and body content, ranked by relevance, across the spaces the authenticated user can access. Each result carries a highlight snippet showing the match in context.',
        inputSchema: {
          type: 'object',
          properties: {
            query: { type: 'string', description: 'Search term or keyword' },
            spaceId: {
              type: 'string',
              description: 'Optional space ID to restrict the search to',
            },
            limit: { type: 'number', description: 'Max results. Defaults to 25.' },
          },
          required: ['query'],
        },
      },
    ];
  }

  /**
   * Bases are Docmost's database pages (table / kanban / calendar). A base is
   * itself a page, so every tool below authorizes against that page.
   */
  private getBaseToolsList() {
    return [
      {
        name: 'create_base',
        description:
          'Create a base (database page) in a space or as a sub-page. A kanban base comes with a "Status" select property and a board view; a table base comes with a grid view.',
        inputSchema: {
          type: 'object',
          properties: {
            name: { type: 'string', description: 'Base name' },
            spaceId: {
              type: 'string',
              description: 'Space ID. Required unless parentPageId is given.',
            },
            parentPageId: { type: 'string', description: 'Optional parent page ID' },
            template: {
              type: 'string',
              enum: ['kanban', 'table'],
              description: 'Base template. Defaults to table.',
            },
          },
          required: ['name'],
        },
      },
      {
        name: 'list_bases',
        description: 'List all bases in a space, with their properties and views.',
        inputSchema: {
          type: 'object',
          properties: {
            spaceId: { type: 'string', description: 'Space ID' },
          },
          required: ['spaceId'],
        },
      },
      {
        name: 'get_base',
        description:
          'Get a base with its full schema: properties (columns) and views. Call this before creating or updating rows so you know the property IDs to use as cell keys.',
        inputSchema: {
          type: 'object',
          properties: {
            pageId: { type: 'string', description: 'Base page ID' },
          },
          required: ['pageId'],
        },
      },
      {
        name: 'update_base',
        description: 'Rename a base.',
        inputSchema: {
          type: 'object',
          properties: {
            pageId: { type: 'string', description: 'Base page ID' },
            name: { type: 'string', description: 'New base name' },
          },
          required: ['pageId'],
        },
      },
      {
        name: 'delete_base',
        description: 'Move a base to the trash.',
        inputSchema: {
          type: 'object',
          properties: {
            pageId: { type: 'string', description: 'Base page ID' },
          },
          required: ['pageId'],
        },
      },
      {
        name: 'convert_page_to_base',
        description: 'Convert an existing regular page into a base.',
        inputSchema: {
          type: 'object',
          properties: {
            pageId: { type: 'string', description: 'Page ID to convert' },
            template: {
              type: 'string',
              enum: ['kanban', 'table'],
              description: 'View to create. Defaults to table.',
            },
          },
          required: ['pageId'],
        },
      },
      {
        name: 'export_base_csv',
        description: 'Export all rows of a base as CSV text.',
        inputSchema: {
          type: 'object',
          properties: {
            pageId: { type: 'string', description: 'Base page ID' },
          },
          required: ['pageId'],
        },
      },
      {
        name: 'create_base_property',
        description:
          'Add a property (column) to a base. For select/multiSelect/status, pass typeOptions with a "choices" array of {id, name, color}.',
        inputSchema: {
          type: 'object',
          properties: {
            pageId: { type: 'string', description: 'Base page ID' },
            name: { type: 'string', description: 'Property name' },
            type: {
              type: 'string',
              enum: BASE_PROPERTY_TYPES,
              description: 'Property type',
            },
            typeOptions: {
              type: 'object',
              description:
                'Type-specific configuration, e.g. { "choices": [{ "id": "todo", "name": "To Do", "color": "gray" }] } for select.',
            },
          },
          required: ['pageId', 'name', 'type'],
        },
      },
      {
        name: 'update_base_property',
        description: 'Rename a property, change its type, or change its typeOptions.',
        inputSchema: {
          type: 'object',
          properties: {
            pageId: { type: 'string', description: 'Base page ID' },
            propertyId: { type: 'string', description: 'Property ID' },
            name: { type: 'string', description: 'Optional new name' },
            type: {
              type: 'string',
              enum: BASE_PROPERTY_TYPES,
              description: 'Optional new type',
            },
            typeOptions: { type: 'object', description: 'Optional new type options' },
          },
          required: ['pageId', 'propertyId'],
        },
      },
      {
        name: 'delete_base_property',
        description: 'Delete a property (column) from a base.',
        inputSchema: {
          type: 'object',
          properties: {
            pageId: { type: 'string', description: 'Base page ID' },
            propertyId: { type: 'string', description: 'Property ID' },
          },
          required: ['pageId', 'propertyId'],
        },
      },
      {
        name: 'reorder_base_property',
        description:
          'Move a property to a new position. Position is a fractional index string (e.g. "h1"); read the current positions with get_base and pick a value that sorts between the two neighbours.',
        inputSchema: {
          type: 'object',
          properties: {
            pageId: { type: 'string', description: 'Base page ID' },
            propertyId: { type: 'string', description: 'Property ID' },
            position: { type: 'string', description: 'New fractional index position' },
          },
          required: ['pageId', 'propertyId', 'position'],
        },
      },
      {
        name: 'create_base_row',
        description:
          'Create a row (card / record) in a base. "cells" is keyed by property ID, not by property name — get the IDs from get_base first.',
        inputSchema: {
          type: 'object',
          properties: {
            pageId: { type: 'string', description: 'Base page ID' },
            cells: {
              type: 'object',
              description: 'Cell values keyed by property ID, e.g. { "a1b2c3d4": "My task" }',
            },
          },
          required: ['pageId'],
        },
      },
      {
        name: 'get_base_row',
        description: 'Get a single row of a base by ID.',
        inputSchema: {
          type: 'object',
          properties: {
            pageId: { type: 'string', description: 'Base page ID' },
            rowId: { type: 'string', description: 'Row ID' },
          },
          required: ['pageId', 'rowId'],
        },
      },
      {
        name: 'list_base_rows',
        description:
          'List rows of a base. Cells are keyed by property ID. Supports an optional filter and cursor pagination — when meta.hasMore is true, call again with meta.nextCursor.',
        inputSchema: {
          type: 'object',
          properties: {
            pageId: { type: 'string', description: 'Base page ID' },
            limit: { type: 'number', description: 'Max rows to return. Defaults to 50.' },
            cursor: { type: 'string', description: 'Cursor from a previous meta.nextCursor' },
            filter: {
              type: 'object',
              description:
                'Filter tree. Leaf: { "propertyId": "...", "op": "eq" | "neq" | "isEmpty" | "isNotEmpty", "value": ... }. Group: { "op": "and" | "or", "children": [ ... ] }.',
            },
          },
          required: ['pageId'],
        },
      },
      {
        name: 'update_base_row',
        description:
          'Update cells of a row. Cells are merged into the existing ones, so you only need to send the properties you want to change.',
        inputSchema: {
          type: 'object',
          properties: {
            pageId: { type: 'string', description: 'Base page ID' },
            rowId: { type: 'string', description: 'Row ID' },
            cells: {
              type: 'object',
              description: 'Cell values to merge, keyed by property ID',
            },
          },
          required: ['pageId', 'rowId', 'cells'],
        },
      },
      {
        name: 'delete_base_row',
        description: 'Delete a single row from a base.',
        inputSchema: {
          type: 'object',
          properties: {
            pageId: { type: 'string', description: 'Base page ID' },
            rowId: { type: 'string', description: 'Row ID' },
          },
          required: ['pageId', 'rowId'],
        },
      },
      {
        name: 'delete_base_rows',
        description: 'Delete several rows from a base in one call.',
        inputSchema: {
          type: 'object',
          properties: {
            pageId: { type: 'string', description: 'Base page ID' },
            rowIds: {
              type: 'array',
              items: { type: 'string' },
              description: 'Row IDs to delete',
            },
          },
          required: ['pageId', 'rowIds'],
        },
      },
      {
        name: 'reorder_base_row',
        description:
          'Move a row to a new position. Position is a fractional index string; read the neighbouring rows with list_base_rows and pick a value that sorts between them.',
        inputSchema: {
          type: 'object',
          properties: {
            pageId: { type: 'string', description: 'Base page ID' },
            rowId: { type: 'string', description: 'Row ID' },
            position: { type: 'string', description: 'New fractional index position' },
          },
          required: ['pageId', 'rowId', 'position'],
        },
      },
      {
        name: 'list_base_views',
        description: 'List the views of a base.',
        inputSchema: {
          type: 'object',
          properties: {
            pageId: { type: 'string', description: 'Base page ID' },
          },
          required: ['pageId'],
        },
      },
      {
        name: 'create_base_view',
        description:
          'Create a view on a base. A kanban view needs config.groupByPropertyId pointing at a select or status property.',
        inputSchema: {
          type: 'object',
          properties: {
            pageId: { type: 'string', description: 'Base page ID' },
            name: { type: 'string', description: 'View name' },
            type: {
              type: 'string',
              enum: BASE_VIEW_TYPES,
              description: 'View type. Defaults to table.',
            },
            config: {
              type: 'object',
              description:
                'View configuration, e.g. { "groupByPropertyId": "<select property id>" } for kanban.',
            },
          },
          required: ['pageId', 'name'],
        },
      },
      {
        name: 'update_base_view',
        description: 'Rename a view, change its type, or update its configuration.',
        inputSchema: {
          type: 'object',
          properties: {
            pageId: { type: 'string', description: 'Base page ID' },
            viewId: { type: 'string', description: 'View ID' },
            name: { type: 'string', description: 'Optional new name' },
            type: {
              type: 'string',
              enum: BASE_VIEW_TYPES,
              description: 'Optional new view type',
            },
            config: { type: 'object', description: 'Optional new configuration' },
          },
          required: ['pageId', 'viewId'],
        },
      },
      {
        name: 'delete_base_view',
        description: 'Delete a view from a base.',
        inputSchema: {
          type: 'object',
          properties: {
            pageId: { type: 'string', description: 'Base page ID' },
            viewId: { type: 'string', description: 'View ID' },
          },
          required: ['pageId', 'viewId'],
        },
      },
    ];
  }

  /**
   * ProseMirror JSON is expensive for an agent to read and easy to
   * misinterpret, so markdown is the default wire format.
   */
  private renderPageContent(content: any, format: string) {
    if (!content || format === 'json') {
      return content;
    }

    return format === 'html' ? jsonToHtml(content) : jsonToMarkdown(content);
  }

  /**
   * Load a page and assert it belongs to the caller's workspace.
   * Workspace mismatch is reported as "not found" so the tool cannot be used
   * to probe for page IDs in other workspaces.
   */
  private async getPageInWorkspace(
    pageId: string,
    workspace: Workspace,
    opts?: { includeContent?: boolean },
  ): Promise<Page> {
    if (!pageId) {
      throw new BadRequestException('pageId is required');
    }

    const page = await this.pageRepo.findById(pageId, {
      includeContent: opts?.includeContent,
    });

    if (!page || page.deletedAt || page.workspaceId !== workspace.id) {
      throw new NotFoundException('Page not found');
    }

    return page;
  }

  private async assertCanCreateInSpace(
    user: User,
    spaceId: string,
  ): Promise<void> {
    const ability = await this.spaceAbility.createForUser(user, spaceId);
    if (ability.cannot(SpaceCaslAction.Create, SpaceCaslSubject.Page)) {
      throw new ForbiddenException();
    }
  }

  private async callTool(
    name: string,
    args: any,
    user: User,
    workspace: Workspace,
  ) {
    switch (name) {
      case 'list_spaces': {
        const spaceIds = await this.spaceMemberRepo.getUserSpaceIds(user.id);
        if (spaceIds.length === 0) {
          return { spaces: [] };
        }

        const spaces = await this.db
          .selectFrom('spaces')
          .select(['id', 'name', 'slug', 'description'])
          .where('id', 'in', spaceIds)
          .where('workspaceId', '=', workspace.id)
          .where('deletedAt', 'is', null)
          .execute();
        return { spaces };
      }

      case 'list_pages': {
        let spaceIds: string[];

        if (args.spaceId) {
          // createForUser throws when the user is not a member of the space
          const ability = await this.spaceAbility.createForUser(
            user,
            args.spaceId,
          );
          if (ability.cannot(SpaceCaslAction.Read, SpaceCaslSubject.Page)) {
            throw new ForbiddenException();
          }
          spaceIds = [args.spaceId];
        } else {
          spaceIds = await this.spaceMemberRepo.getUserSpaceIds(user.id);
        }

        if (spaceIds.length === 0) {
          return { pages: [] };
        }

        const pages = await this.db
          .selectFrom('pages')
          .select([
            'id',
            'title',
            'slugId',
            'spaceId',
            'parentPageId',
            'isBase',
            'createdAt',
            'updatedAt',
          ])
          .where('workspaceId', '=', workspace.id)
          .where('spaceId', 'in', spaceIds)
          .where('deletedAt', 'is', null)
          .limit(100)
          .execute();

        return { pages: await this.filterRestrictedPages(pages, user, args.spaceId) };
      }

      case 'get_page': {
        const page = await this.getPageInWorkspace(args.pageId, workspace, {
          includeContent: true,
        });

        await this.pageAccessService.validateCanView(page, user);

        const format = args.format || 'markdown';

        return {
          id: page.id,
          title: page.title,
          slugId: page.slugId,
          spaceId: page.spaceId,
          parentPageId: page.parentPageId,
          format,
          content: this.renderPageContent(page.content, format),
          createdAt: page.createdAt,
          updatedAt: page.updatedAt,
        };
      }

      case 'create_page': {
        if (!args.spaceId) {
          throw new BadRequestException('spaceId is required');
        }

        if (args.parentPageId) {
          const parentPage = await this.getPageInWorkspace(
            args.parentPageId,
            workspace,
          );
          if (parentPage.spaceId !== args.spaceId) {
            throw new NotFoundException('Parent page not found');
          }
          await this.pageAccessService.validateCanEdit(parentPage, user);
        } else {
          await this.assertCanCreateInSpace(user, args.spaceId);
        }

        const page = await this.pageService.create(user.id, workspace.id, {
          title: args.title,
          spaceId: args.spaceId,
          parentPageId: args.parentPageId || undefined,
          content: args.content || '',
          format: 'markdown',
        });

        this.auditService.log({
          event: AuditEvent.PAGE_CREATED,
          resourceType: AuditResource.PAGE,
          resourceId: page.id,
          spaceId: page.spaceId,
          changes: {
            after: {
              title: getPageTitle(page.title),
              spaceId: page.spaceId,
            },
          },
        });

        return {
          success: true,
          pageId: page.id,
          title: page.title,
          slugId: page.slugId,
        };
      }

      case 'update_page': {
        const page = await this.getPageInWorkspace(args.pageId, workspace);

        await this.pageAccessService.validateCanEdit(page, user);

        const hasContent = args.content !== undefined && args.content !== null;

        const updatePageDto: UpdatePageDto = {
          pageId: page.id,
          title: args.title,
          ...(hasContent && {
            content: args.content,
            operation: (args.operation || 'append') as ContentOperation,
            format: 'markdown' as ContentFormat,
          }),
        };

        const updatedPage = await this.pageService.update(
          page,
          updatePageDto,
          user,
        );

        return {
          success: true,
          pageId: updatedPage.id,
          title: updatedPage.title,
        };
      }

      case 'delete_page': {
        const page = await this.getPageInWorkspace(args.pageId, workspace);

        await this.pageAccessService.validateCanEdit(page, user);

        await this.pageService.removePage(page.id, user.id, workspace.id);

        this.auditService.log({
          event: AuditEvent.PAGE_TRASHED,
          resourceType: AuditResource.PAGE,
          resourceId: page.id,
          spaceId: page.spaceId,
          changes: {
            before: {
              pageId: page.id,
              slugId: page.slugId,
              title: getPageTitle(page.title),
              spaceId: page.spaceId,
            },
          },
        });

        return { success: true, message: 'Page moved to trash' };
      }

      case 'search_workspace': {
        if (!args.query) {
          throw new BadRequestException('query is required');
        }

        if (args.spaceId) {
          const ability = await this.spaceAbility.createForUser(
            user,
            args.spaceId,
          );
          if (ability.cannot(SpaceCaslAction.Read, SpaceCaslSubject.Page)) {
            throw new ForbiddenException();
          }
        }

        // searchPage scopes to the user's spaces and applies page-level
        // restrictions itself when userId is passed.
        const { items } = await this.searchService.searchPage(
          {
            query: args.query,
            spaceId: args.spaceId,
            limit: args.limit || 25,
          } as SearchDTO,
          { userId: user.id, workspaceId: workspace.id },
        );

        return {
          results: items.map((item: any) => ({
            id: item.id,
            title: item.title,
            slugId: item.slugId,
            spaceId: item.space?.id ?? item.spaceId,
            spaceName: item.space?.name,
            highlight: item.highlight,
          })),
        };
      }

      default:
        return this.callBaseTool(name, args, user, workspace);
    }
  }

  private async callBaseTool(
    name: string,
    args: any,
    user: User,
    workspace: Workspace,
  ) {
    switch (name) {
      case 'create_base': {
        const spaceId = await this.resolveBaseSpaceId(args, workspace, user);

        return this.baseService.createBase(
          {
            name: args.name,
            spaceId,
            parentPageId: args.parentPageId,
            template: args.template || 'table',
          },
          user.id,
          workspace.id,
        );
      }

      case 'list_bases': {
        if (!args.spaceId) {
          throw new BadRequestException('spaceId is required');
        }

        const ability = await this.spaceAbility.createForUser(
          user,
          args.spaceId,
        );
        if (ability.cannot(SpaceCaslAction.Read, SpaceCaslSubject.Page)) {
          throw new ForbiddenException();
        }

        const { items } = await this.baseService.listBases(
          args.spaceId,
          workspace.id,
        );

        return {
          items: await this.filterRestrictedPages(items, user, args.spaceId),
        };
      }

      case 'get_base': {
        const base = await this.assertCanViewBase(args.pageId, user, workspace);
        return this.baseService.getBaseInfo(base.id, workspace.id);
      }

      case 'update_base': {
        const base = await this.assertCanEditBase(args.pageId, user, workspace);
        return this.baseService.updateBase(
          { pageId: base.id, name: args.name },
          workspace.id,
        );
      }

      case 'delete_base': {
        const base = await this.assertCanEditBase(args.pageId, user, workspace);
        await this.baseService.deleteBase(base.id, workspace.id);

        this.auditService.log({
          event: AuditEvent.PAGE_TRASHED,
          resourceType: AuditResource.PAGE,
          resourceId: base.id,
          spaceId: base.spaceId,
          changes: {
            before: {
              pageId: base.id,
              slugId: base.slugId,
              title: getPageTitle(base.title),
              spaceId: base.spaceId,
            },
          },
        });

        return { success: true, message: 'Base moved to trash' };
      }

      case 'convert_page_to_base': {
        const page = await this.getPageInWorkspace(args.pageId, workspace);
        await this.pageAccessService.validateCanEdit(page, user);

        return this.baseService.convertPageToBase(
          page.id,
          args.template,
          user.id,
          workspace.id,
        );
      }

      case 'export_base_csv': {
        const base = await this.assertCanViewBase(args.pageId, user, workspace);
        return this.baseService.exportToCsv(base.id, workspace.id);
      }

      case 'create_base_property': {
        const base = await this.assertCanEditBase(args.pageId, user, workspace);
        return this.baseService.createProperty(
          {
            pageId: base.id,
            name: args.name,
            type: args.type,
            typeOptions: args.typeOptions,
          },
          workspace.id,
        );
      }

      case 'update_base_property': {
        const base = await this.assertCanEditBase(args.pageId, user, workspace);
        return this.baseService.updateProperty(
          {
            pageId: base.id,
            propertyId: args.propertyId,
            name: args.name,
            type: args.type,
            typeOptions: args.typeOptions,
          },
          workspace.id,
        );
      }

      case 'delete_base_property': {
        const base = await this.assertCanEditBase(args.pageId, user, workspace);
        await this.baseService.deleteProperty(
          args.propertyId,
          base.id,
          workspace.id,
        );
        return { success: true, propertyId: args.propertyId };
      }

      case 'reorder_base_property': {
        const base = await this.assertCanEditBase(args.pageId, user, workspace);
        await this.baseService.reorderProperty(
          args.propertyId,
          base.id,
          args.position,
          workspace.id,
        );
        return { success: true, propertyId: args.propertyId };
      }

      case 'create_base_row': {
        const base = await this.assertCanEditBase(args.pageId, user, workspace);
        return this.baseService.createRow(
          { pageId: base.id, cells: args.cells },
          user.id,
          workspace.id,
        );
      }

      case 'get_base_row': {
        const base = await this.assertCanViewBase(args.pageId, user, workspace);
        return this.baseService.getRowInfo(args.rowId, base.id, workspace.id);
      }

      case 'list_base_rows': {
        const base = await this.assertCanViewBase(args.pageId, user, workspace);
        return this.baseService.listRows(
          {
            pageId: base.id,
            limit: args.limit,
            cursor: args.cursor,
            filter: args.filter,
          },
          workspace.id,
        );
      }

      case 'update_base_row': {
        const base = await this.assertCanEditBase(args.pageId, user, workspace);
        return this.baseService.updateRow(
          { pageId: base.id, rowId: args.rowId, cells: args.cells },
          user.id,
          workspace.id,
        );
      }

      case 'delete_base_row': {
        const base = await this.assertCanEditBase(args.pageId, user, workspace);
        await this.baseService.deleteRow(args.rowId, base.id, workspace.id);
        return { success: true, rowId: args.rowId };
      }

      case 'delete_base_rows': {
        const base = await this.assertCanEditBase(args.pageId, user, workspace);

        if (!Array.isArray(args.rowIds) || args.rowIds.length === 0) {
          throw new BadRequestException('rowIds must be a non-empty array');
        }

        await this.baseService.deleteRows(args.rowIds, base.id, workspace.id);
        return { success: true, deleted: args.rowIds.length };
      }

      case 'reorder_base_row': {
        const base = await this.assertCanEditBase(args.pageId, user, workspace);
        await this.baseService.reorderRow(
          args.rowId,
          base.id,
          args.position,
          workspace.id,
        );
        return { success: true, rowId: args.rowId };
      }

      case 'list_base_views': {
        const base = await this.assertCanViewBase(args.pageId, user, workspace);
        return { views: await this.baseService.listViews(base.id, workspace.id) };
      }

      case 'create_base_view': {
        const base = await this.assertCanEditBase(args.pageId, user, workspace);
        return this.baseService.createView(
          {
            pageId: base.id,
            name: args.name,
            type: args.type,
            config: args.config,
          },
          user.id,
          workspace.id,
        );
      }

      case 'update_base_view': {
        const base = await this.assertCanEditBase(args.pageId, user, workspace);
        return this.baseService.updateView(
          {
            pageId: base.id,
            viewId: args.viewId,
            name: args.name,
            type: args.type,
            config: args.config,
          },
          workspace.id,
        );
      }

      case 'delete_base_view': {
        const base = await this.assertCanEditBase(args.pageId, user, workspace);
        await this.baseService.deleteView(args.viewId, base.id, workspace.id);
        return { success: true, viewId: args.viewId };
      }

      default:
        throw new BadRequestException(`Unknown tool: ${name}`);
    }
  }

  /**
   * A base is a page, so base access is page access. Resolving through
   * getPageInWorkspace also lets the agent pass a slugId instead of a UUID.
   */
  private async assertCanViewBase(
    pageId: string,
    user: User,
    workspace: Workspace,
  ): Promise<Page> {
    const page = await this.getPageInWorkspace(pageId, workspace);

    if (!page.isBase) {
      throw new NotFoundException('Base not found');
    }

    await this.pageAccessService.validateCanView(page, user);
    return page;
  }

  private async assertCanEditBase(
    pageId: string,
    user: User,
    workspace: Workspace,
  ): Promise<Page> {
    const page = await this.getPageInWorkspace(pageId, workspace);

    if (!page.isBase) {
      throw new NotFoundException('Base not found');
    }

    await this.pageAccessService.validateCanEdit(page, user);
    return page;
  }

  /**
   * Drop pages the user cannot reach because of page-level restrictions.
   * Space membership alone is not enough — a page (or an ancestor) can be
   * restricted to a subset of the space members.
   */
  private async filterRestrictedPages<T extends { id: string }>(
    pages: T[],
    user: User,
    spaceId?: string,
  ): Promise<T[]> {
    if (pages.length === 0) return pages;

    const accessibleIds = await this.pagePermissionRepo.filterAccessiblePageIds({
      pageIds: pages.map((page) => page.id),
      userId: user.id,
      spaceId,
    });

    const accessible = new Set(accessibleIds);
    return pages.filter((page) => accessible.has(page.id));
  }

  /**
   * createBase derives the space from the parent page when spaceId is omitted.
   * Resolve it here first so the permission check runs against the real target.
   */
  private async resolveBaseSpaceId(
    args: any,
    workspace: Workspace,
    user: User,
  ): Promise<string> {
    if (args.parentPageId) {
      const parentPage = await this.getPageInWorkspace(
        args.parentPageId,
        workspace,
      );

      if (args.spaceId && parentPage.spaceId !== args.spaceId) {
        throw new BadRequestException(
          'parentPageId does not belong to the given spaceId',
        );
      }

      await this.pageAccessService.validateCanEdit(parentPage, user);
      return parentPage.spaceId;
    }

    if (!args.spaceId) {
      throw new BadRequestException('spaceId or parentPageId is required');
    }

    await this.assertCanCreateInSpace(user, args.spaceId);
    return args.spaceId;
  }
}
