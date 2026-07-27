import {
  Injectable,
  BadRequestException,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { InjectKysely } from 'nestjs-kysely';
import { KyselyDB } from '@docmost/db/types/kysely.types';
import { generateText, streamText, tool } from 'ai';
import { z } from 'zod';
import { AiProviderFactory } from '../ai/ai-provider.factory';
import { sql } from 'kysely';
import { PageService } from '../../core/page/services/page.service';
import { PageRepo } from '@docmost/db/repos/page/page.repo';
import { User } from '@docmost/db/types/entity.types';
import { ContentOperation } from '../../core/page/dto/update-page.dto';

@Injectable()
export class AiChatService {
  constructor(
    @InjectKysely() private readonly db: KyselyDB,
    private readonly providerFactory: AiProviderFactory,
    private readonly pageService: PageService,
    private readonly pageRepo: PageRepo,
  ) {}

  async createChat(userId: string, workspaceId: string) {
    const chat = await this.db
      .insertInto('aiChats')
      .values({
        workspaceId,
        creatorId: userId,
      })
      .returningAll()
      .executeTakeFirstOrThrow();

    return chat;
  }

  async listChats(
    userId: string,
    workspaceId: string,
    params?: { limit?: number; cursor?: string },
  ) {
    const limit = Math.min(params?.limit || 30, 100);

    let query = this.db
      .selectFrom('aiChats')
      .selectAll()
      .where('workspaceId', '=', workspaceId)
      .where('creatorId', '=', userId)
      .where('deletedAt', 'is', null)
      .orderBy('updatedAt', 'desc')
      .limit(limit + 1);

    if (params?.cursor) {
      query = query.where('id', '<', params.cursor);
    }

    const results = await query.execute();
    const hasNextPage = results.length > limit;
    const items = hasNextPage ? results.slice(0, limit) : results;

    return {
      items,
      meta: {
        hasNextPage,
        nextCursor: hasNextPage ? items[items.length - 1]?.id : undefined,
        limit,
      },
    };
  }

  async getChatInfo(chatId: string, userId: string, workspaceId: string) {
    const chat = await this.db
      .selectFrom('aiChats')
      .selectAll()
      .where('id', '=', chatId)
      .where('workspaceId', '=', workspaceId)
      .where('deletedAt', 'is', null)
      .executeTakeFirst();

    if (!chat) {
      throw new NotFoundException('Chat not found');
    }

    if (chat.creatorId !== userId) {
      throw new ForbiddenException('Access denied');
    }

    const messages = await this.db
      .selectFrom('aiChatMessages')
      .selectAll()
      .where('chatId', '=', chatId)
      .where('deletedAt', 'is', null)
      .orderBy('createdAt', 'asc')
      .execute();

    return { chat, messages };
  }

  async deleteChat(chatId: string, userId: string, workspaceId: string) {
    const chat = await this.db
      .selectFrom('aiChats')
      .selectAll()
      .where('id', '=', chatId)
      .where('workspaceId', '=', workspaceId)
      .where('creatorId', '=', userId)
      .where('deletedAt', 'is', null)
      .executeTakeFirst();

    if (!chat) {
      throw new NotFoundException('Chat not found');
    }

    await this.db
      .updateTable('aiChats')
      .set({ deletedAt: new Date() })
      .where('id', '=', chatId)
      .execute();
  }

  async updateChatTitle(
    chatId: string,
    title: string,
    userId: string,
    workspaceId: string,
  ) {
    const chat = await this.db
      .selectFrom('aiChats')
      .selectAll()
      .where('id', '=', chatId)
      .where('workspaceId', '=', workspaceId)
      .where('creatorId', '=', userId)
      .where('deletedAt', 'is', null)
      .executeTakeFirst();

    if (!chat) {
      throw new NotFoundException('Chat not found');
    }

    await this.db
      .updateTable('aiChats')
      .set({ title, updatedAt: new Date() })
      .where('id', '=', chatId)
      .execute();
  }

  async searchChats(query: string, userId: string, workspaceId: string) {
    const tsQuery = query
      .trim()
      .split(/\s+/)
      .map((word) => `${word}:*`)
      .join(' & ');

    // Search in chat titles
    const titleResults = await this.db
      .selectFrom('aiChats')
      .selectAll()
      .where('workspaceId', '=', workspaceId)
      .where('creatorId', '=', userId)
      .where('deletedAt', 'is', null)
      .where('title', 'ilike', `%${query}%`)
      .orderBy('updatedAt', 'desc')
      .limit(20)
      .execute();

    // Search in messages
    const messageResults = await this.db
      .selectFrom('aiChatMessages')
      .innerJoin('aiChats', 'aiChats.id', 'aiChatMessages.chatId')
      .select([
        'aiChats.id',
        'aiChats.workspaceId',
        'aiChats.creatorId',
        'aiChats.title',
        'aiChats.createdAt',
        'aiChats.updatedAt',
        'aiChats.deletedAt',
      ])
      .where('aiChats.workspaceId', '=', workspaceId)
      .where('aiChats.creatorId', '=', userId)
      .where('aiChats.deletedAt', 'is', null)
      .where('aiChatMessages.deletedAt', 'is', null)
      .where(
        sql<boolean>`ai_chat_messages.tsv @@ to_tsquery('english', ${tsQuery})`,
      )
      .groupBy([
        'aiChats.id',
        'aiChats.workspaceId',
        'aiChats.creatorId',
        'aiChats.title',
        'aiChats.createdAt',
        'aiChats.updatedAt',
        'aiChats.deletedAt',
      ])
      .orderBy('aiChats.updatedAt', 'desc')
      .limit(20)
      .execute();

    // Merge and deduplicate
    const seen = new Set<string>();
    const combined = [];

    for (const chat of [...titleResults, ...messageResults]) {
      if (!seen.has(chat.id)) {
        seen.add(chat.id);
        combined.push(chat);
      }
    }

    return combined.slice(0, 20);
  }

  async *sendMessage(
    params: {
      chatId?: string;
      content: string;
      mentionedPageIds?: string[];
      contextPageId?: string;
      attachmentIds?: string[];
    },
    user: User,
    workspaceId: string,
  ) {
    if (!this.providerFactory.isConfigured()) {
      throw new BadRequestException('AI is not configured');
    }

    const userId = user.id;

    // Create or get chat
    let chatId = params.chatId;
    if (!chatId) {
      const chat = await this.createChat(userId, workspaceId);
      chatId = chat.id;
      yield { type: 'chat_created', chatId };
    }

    // Verify chat ownership
    const chat = await this.db
      .selectFrom('aiChats')
      .selectAll()
      .where('id', '=', chatId)
      .where('workspaceId', '=', workspaceId)
      .where('creatorId', '=', userId)
      .where('deletedAt', 'is', null)
      .executeTakeFirst();

    if (!chat) {
      throw new NotFoundException('Chat not found');
    }

    // Save user message
    await this.db
      .insertInto('aiChatMessages')
      .values({
        chatId,
        workspaceId,
        userId,
        role: 'user',
        content: params.content,
        metadata: params.mentionedPageIds?.length
          ? JSON.stringify({ mentionedPageIds: params.mentionedPageIds })
          : null,
      })
      .execute();

    // Get conversation history
    const history = await this.db
      .selectFrom('aiChatMessages')
      .select(['role', 'content'])
      .where('chatId', '=', chatId)
      .where('deletedAt', 'is', null)
      .orderBy('createdAt', 'asc')
      .execute();

    // Build context from mentioned pages
    let contextText = '';
    if (params.mentionedPageIds?.length) {
      const pages = await this.db
        .selectFrom('pages')
        .select(['title', 'content'])
        .where('id', 'in', params.mentionedPageIds)
        .where('workspaceId', '=', workspaceId)
        .execute();

      if (pages.length > 0) {
        contextText = pages
          .map((p) => `## ${p.title}\n${this.extractTextFromContent(p.content)}`)
          .join('\n\n');
      }
    }

    if (params.contextPageId) {
      const page = await this.db
        .selectFrom('pages')
        .select(['id', 'title', 'content'])
        .where('id', '=', params.contextPageId)
        .where('workspaceId', '=', workspaceId)
        .executeTakeFirst();

      if (page) {
        contextText += `\n\n## Current page (ID: ${page.id}, Title: ${page.title}):\n${this.extractTextFromContent(page.content)}`;
      }
    }

    // Build messages for AI SDK
    const messages: any[] = history.map((msg) => ({
      role: msg.role as 'user' | 'assistant',
      content: msg.content || '',
    }));

    const systemPrompt = this.buildSystemPrompt(contextText, params.contextPageId);

    const tools: Record<string, any> = {
      edit_page: (tool as any)({
        description:
          'Edit, update, append to, or replace the content of a document page. ' +
          'Use this tool whenever the user asks you to edit a page, add text, rewrite content, insert code, or update a document page.',
        parameters: z.object({
          pageId: z.string().describe('The ID of the page to edit'),
          content: z.string().describe('The markdown content to insert or update'),
          operation: z
            .enum(['append', 'prepend', 'replace'])
            .default('append')
            .describe(
              'append (add to bottom), prepend (add to top), or replace (overwrite entire document)',
            ),
        }),
        execute: async ({ pageId, content, operation }: any) => {
          try {
            await this.pageService.updatePageContent(
              pageId,
              content,
              operation as ContentOperation,
              'markdown',
              user,
            );
            return {
              success: true,
              pageId,
              operation,
              message: 'Page content updated successfully',
            };
          } catch (err: any) {
            return { success: false, error: err.message };
          }
        },
      }),
      update_page_title: (tool as any)({
        description: 'Update the title of a document page.',
        parameters: z.object({
          pageId: z.string().describe('The ID of the page'),
          title: z.string().describe('The new title for the page'),
        }),
        execute: async ({ pageId, title }: any) => {
          try {
            await this.pageRepo.updatePage({ title, updatedAt: new Date() }, pageId);
            return { success: true, pageId, title };
          } catch (err: any) {
            return { success: false, error: err.message };
          }
        },
      }),
    };

    // Stream the AI response with tools
    const result = streamText({
      model: this.providerFactory.getChatModel(),
      system: systemPrompt,
      messages,
      tools,
    });

    let fullResponse = '';

    for await (const chunk of (result as any).fullStream) {
      if (chunk.type === 'text-delta') {
        const text = chunk.textDelta ?? chunk.text ?? '';
        fullResponse += text;
        yield { type: 'content', text };
      } else if (chunk.type === 'tool-call') {
        yield {
          type: 'tool_call',
          id: chunk.toolCallId,
          name: chunk.toolName,
          args: (chunk.args ?? chunk.input ?? {}) as Record<string, unknown>,
        };
      } else if (chunk.type === 'tool-result') {
        yield {
          type: 'tool_result',
          id: chunk.toolCallId,
          result: chunk.result ?? chunk.output,
        };
      }
    }

    // Save assistant message
    const assistantMsg = await this.db
      .insertInto('aiChatMessages')
      .values({
        chatId,
        workspaceId,
        role: 'assistant',
        content: fullResponse,
      })
      .returning(['id'])
      .executeTakeFirstOrThrow();

    // Auto-generate title if it's the first exchange
    if (!chat.title && history.length <= 1) {
      this.autoGenerateTitle(chatId, params.content, fullResponse).catch(
        () => {},
      );
    }

    // Update chat timestamp
    await this.db
      .updateTable('aiChats')
      .set({ updatedAt: new Date() })
      .where('id', '=', chatId)
      .execute();

    yield { type: 'done', messageId: assistantMsg.id };
  }

  private buildSystemPrompt(context: string, currentContextPageId?: string): string {
    let prompt =
      'You are a helpful AI assistant integrated into a document management system called Docmost. ' +
      'You have full capabilities to edit, update, append to, or modify document pages directly in real-time. ' +
      'When the user asks you to edit, update, add text to, format, or draw diagrams in a page, ALWAYS use the `edit_page` tool with the page ID.\n\n' +
      'You are capable of writing rich Markdown syntax that Docmost renders into interactive UI elements:\n' +
      '- **Mermaid Diagrams**: Use ```mermaid code blocks (e.g. ```mermaid\\ngraph TD;\\n  A-->B;\\n```) for flowcharts, sequence diagrams, mindmaps, architecture diagrams, ERDs, and gantt charts.\n' +
      '- **Tables**: Use standard Markdown table syntax (| Header 1 | Header 2 |).\n' +
      '- **Code Blocks**: Use fenced code blocks with language identifiers (e.g., ```typescript, ```yaml, ```json, ```python).\n' +
      '- **Callouts/Alerts**: Use blockquotes with alert syntax (e.g., > [!NOTE], > [!TIP], > [!IMPORTANT], > [!WARNING], > [!CAUTION]).\n' +
      '- **Task Lists**: Use `- [ ]` and `- [x]` for interactive task checklists.\n' +
      'Format your responses using Markdown when appropriate.';

    if (currentContextPageId) {
      prompt += `\n\nThe user is currently viewing the page with ID: "${currentContextPageId}". Use this pageId for editing unless specified otherwise.`;
    }

    if (context) {
      prompt += `\n\nDocument context:\n\n${context}`;
    }

    return prompt;
  }

  private extractTextFromContent(content: any): string {
    if (!content) return '';
    if (typeof content === 'string') return content;

    // Handle Prosemirror/Tiptap JSON content
    try {
      const doc = typeof content === 'string' ? JSON.parse(content) : content;
      return this.extractTextFromNode(doc);
    } catch {
      return String(content);
    }
  }

  private extractTextFromNode(node: any): string {
    if (!node) return '';

    let text = '';

    if (node.text) {
      text += node.text;
    }

    if (node.content && Array.isArray(node.content)) {
      for (const child of node.content) {
        text += this.extractTextFromNode(child);
      }
      // Add newline after block-level nodes
      if (['paragraph', 'heading', 'listItem', 'blockquote'].includes(node.type)) {
        text += '\n';
      }
    }

    return text;
  }

  private async autoGenerateTitle(
    chatId: string,
    userMessage: string,
    assistantResponse: string,
  ) {
    try {
      if (!this.providerFactory.isConfigured()) return;

      const result = await generateText({
        model: this.providerFactory.getCompletionModel(),
        system:
          'Generate a very short title (max 6 words) for this conversation. ' +
          'Return only the title text, nothing else. No quotes or punctuation at the end.',
        prompt: `User: ${userMessage.substring(0, 200)}\nAssistant: ${assistantResponse.substring(0, 200)}`,
      });

      const title = result.text.trim().substring(0, 100);
      if (title) {
        await this.db
          .updateTable('aiChats')
          .set({ title })
          .where('id', '=', chatId)
          .execute();
      }
    } catch {
      // Silently fail - title generation is not critical
    }
  }
}
