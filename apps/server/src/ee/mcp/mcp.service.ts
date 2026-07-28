import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectKysely } from 'nestjs-kysely';
import { KyselyDB } from '@docmost/db/types/kysely.types';
import { PageService } from '../../core/page/services/page.service';
import { BaseService } from '../base/base.service';
import { User, Workspace } from '@docmost/db/types/entity.types';

@Injectable()
export class McpService {
  constructor(
    @InjectKysely() private readonly db: KyselyDB,
    private readonly pageService: PageService,
    private readonly baseService: BaseService,
  ) {}

  async handleRpcRequest(body: any, user: User, workspace: Workspace) {
    const { jsonrpc, id, method, params } = body || {};

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
                text: `Error executing tool '${toolName}': ${err.message}`,
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

  private getToolsList() {
    return [
      {
        name: 'list_spaces',
        description: 'List all spaces available in the Docmost workspace.',
        inputSchema: {
          type: 'object',
          properties: {},
        },
      },
      {
        name: 'list_pages',
        description: 'List pages in the workspace or in a specific space.',
        inputSchema: {
          type: 'object',
          properties: {
            spaceId: { type: 'string', description: 'Optional space ID filter' },
          },
        },
      },
      {
        name: 'get_page',
        description: 'Retrieve full content and metadata of a page by pageId or slugId.',
        inputSchema: {
          type: 'object',
          properties: {
            pageId: { type: 'string', description: 'Page ID or slug ID' },
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
        description: 'Delete a page by pageId.',
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
        description: 'Search pages and documents across the workspace.',
        inputSchema: {
          type: 'object',
          properties: {
            query: { type: 'string', description: 'Search term or keyword' },
          },
          required: ['query'],
        },
      },
      {
        name: 'create_kanban',
        description: 'Create a Kanban board in a space or as a sub-page.',
        inputSchema: {
          type: 'object',
          properties: {
            name: { type: 'string', description: 'Kanban board name' },
            spaceId: { type: 'string', description: 'Space ID' },
            parentPageId: { type: 'string', description: 'Optional parent page ID' },
          },
          required: ['name'],
        },
      },
    ];
  }

  private async callTool(
    name: string,
    args: any,
    user: User,
    workspace: Workspace,
  ) {
    switch (name) {
      case 'list_spaces': {
        const spaces = await this.db
          .selectFrom('spaces')
          .select(['id', 'name', 'slug', 'description'])
          .where('workspaceId', '=', workspace.id)
          .where('deletedAt', 'is', null)
          .execute();
        return { spaces };
      }

      case 'list_pages': {
        let query = this.db
          .selectFrom('pages')
          .select(['id', 'title', 'slugId', 'spaceId', 'parentPageId', 'isBase', 'createdAt', 'updatedAt'])
          .where('workspaceId', '=', workspace.id)
          .where('deletedAt', 'is', null);

        if (args.spaceId) {
          query = query.where('spaceId', '=', args.spaceId);
        }

        const pages = await query.limit(100).execute();
        return { pages };
      }

      case 'get_page': {
        const page = await this.db
          .selectFrom('pages')
          .selectAll()
          .where((eb) =>
            eb.or([
              eb('id', '=', args.pageId),
              eb('slugId', '=', args.pageId),
            ]),
          )
          .where('workspaceId', '=', workspace.id)
          .where('deletedAt', 'is', null)
          .executeTakeFirst();

        if (!page) throw new NotFoundException('Page not found');

        return {
          id: page.id,
          title: page.title,
          slugId: page.slugId,
          spaceId: page.spaceId,
          parentPageId: page.parentPageId,
          content: page.content,
          createdAt: page.createdAt,
          updatedAt: page.updatedAt,
        };
      }

      case 'create_page': {
        const page = await this.pageService.create(user.id, workspace.id, {
          title: args.title,
          spaceId: args.spaceId,
          parentPageId: args.parentPageId || undefined,
          content: args.content || '',
          format: 'markdown',
        });
        return { success: true, pageId: page.id, title: page.title, slugId: page.slugId };
      }

      case 'update_page': {
        if (args.title) {
          await this.db
            .updateTable('pages')
            .set({ title: args.title, updatedAt: new Date() })
            .where('id', '=', args.pageId)
            .where('workspaceId', '=', workspace.id)
            .execute();
        }

        if (args.content) {
          await this.pageService.updatePageContent(
            args.pageId,
            args.content,
            (args.operation || 'append') as any,
            'markdown',
            user,
          );
        }

        return { success: true, pageId: args.pageId };
      }

      case 'delete_page': {
        await this.db
          .updateTable('pages')
          .set({ deletedAt: new Date() })
          .where('id', '=', args.pageId)
          .where('workspaceId', '=', workspace.id)
          .execute();
        return { success: true, message: 'Page deleted' };
      }

      case 'search_workspace': {
        const searchPattern = `%${args.query}%`;
        const pages = await this.db
          .selectFrom('pages')
          .select(['id', 'title', 'slugId', 'spaceId'])
          .where('workspaceId', '=', workspace.id)
          .where('deletedAt', 'is', null)
          .where('title', 'ilike', searchPattern)
          .limit(20)
          .execute();
        return { results: pages };
      }

      case 'create_kanban': {
        const res: any = await this.baseService.createBase(
          {
            name: args.name,
            spaceId: args.spaceId,
            parentPageId: args.parentPageId,
            template: 'kanban',
          },
          user.id,
          workspace.id,
        );
        return { success: true, baseId: res.id, title: res.title };
      }

      default:
        throw new BadRequestException(`Unknown tool: ${name}`);
    }
  }
}
