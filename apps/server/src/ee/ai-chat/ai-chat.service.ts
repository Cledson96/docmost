import {
  Injectable,
  BadRequestException,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { InjectKysely } from 'nestjs-kysely';
import { KyselyDB } from '@docmost/db/types/kysely.types';
import { generateText, streamText } from 'ai';
import { AiProviderFactory } from '../ai/ai-provider.factory';
import { sql } from 'kysely';

@Injectable()
export class AiChatService {
  constructor(
    @InjectKysely() private readonly db: KyselyDB,
    private readonly providerFactory: AiProviderFactory,
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
    userId: string,
    workspaceId: string,
  ) {
    if (!this.providerFactory.isConfigured()) {
      throw new BadRequestException('AI is not configured');
    }

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
        .select(['title', 'content'])
        .where('id', '=', params.contextPageId)
        .where('workspaceId', '=', workspaceId)
        .executeTakeFirst();

      if (page) {
        contextText += `\n\n## Current page: ${page.title}\n${this.extractTextFromContent(page.content)}`;
      }
    }

    // Build messages for AI SDK
    const messages: any[] = history.map((msg) => ({
      role: msg.role as 'user' | 'assistant',
      content: msg.content || '',
    }));

    const systemPrompt = this.buildSystemPrompt(contextText);

    // Stream the AI response
    const result = streamText({
      model: this.providerFactory.getChatModel(),
      system: systemPrompt,
      messages,
    });

    let fullResponse = '';

    for await (const chunk of result.textStream) {
      fullResponse += chunk;
      yield { type: 'content', text: chunk };
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

  private buildSystemPrompt(context: string): string {
    let prompt =
      'You are a helpful AI assistant integrated into a document management system called Docmost. ' +
      'You help users with their questions, writing, and document-related tasks. ' +
      'Be concise, helpful, and accurate. Format your responses using Markdown when appropriate.';

    if (context) {
      prompt += `\n\nThe user has referenced the following document content for context:\n\n${context}`;
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
