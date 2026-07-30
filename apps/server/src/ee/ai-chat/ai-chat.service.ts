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
import { PageService } from '../../core/page/services/page.service';
import { PageRepo } from '@docmost/db/repos/page/page.repo';
import { SpaceMemberRepo } from '@docmost/db/repos/space/space-member.repo';
import { Page, User } from '@docmost/db/types/entity.types';
import { ContentOperation } from '../../core/page/dto/update-page.dto';
import { PageAccessService } from '../../core/page/page-access/page-access.service';
import { EmbeddingService } from '../embedding/embedding.service';
import { EnvironmentService } from '../../integrations/environment/environment.service';
import {
  editRefusalNotice,
  languageFromLocale,
} from '../ai/ai-language.util';

/** How many wiki pages get pulled into the prompt when retrieving context. */
const RETRIEVAL_LIMIT = 5;
/** Characters of each retrieved page handed to the model. */
const RETRIEVAL_EXCERPT = 1500;

type EditOutcome = {
  pageId: string;
  action: 'content' | 'title';
  applied: boolean;
  reason?: string;
};

@Injectable()
export class AiChatService {
  constructor(
    @InjectKysely() private readonly db: KyselyDB,
    private readonly providerFactory: AiProviderFactory,
    private readonly pageService: PageService,
    private readonly pageRepo: PageRepo,
    private readonly pageAccessService: PageAccessService,
    private readonly spaceMemberRepo: SpaceMemberRepo,
    private readonly embeddingService: EmbeddingService,
    private readonly environmentService: EnvironmentService,
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
    if (!(await this.providerFactory.isConfigured(workspaceId))) {
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

    // Without tools the model cannot go looking for anything, so pages the
    // question is about are retrieved up front. Explicitly supplied context
    // (a mention, the open page) is left as the authoritative source and only
    // topped up with whatever else the wiki has.
    const alreadyInContext = [
      ...(params.mentionedPageIds ?? []),
      params.contextPageId,
    ].filter(Boolean) as string[];

    const retrievalCallId = `retrieval-${chatId}-${history.length}`;
    yield {
      type: 'tool_call',
      id: retrievalCallId,
      name: 'search_pages',
      args: { query: params.content },
    };

    const retrieved = await this.retrieveWikiContext({
      query: params.content,
      workspaceId,
      userId,
      excludePageIds: alreadyInContext,
    });

    yield {
      type: 'tool_result',
      id: retrievalCallId,
      result: {
        method: retrieved.method,
        pages: retrieved.pages.map((p) => ({ id: p.id, title: p.title })),
      },
    };

    if (retrieved.pages.length > 0) {
      contextText +=
        '\n\n## Related pages found in the wiki\n' +
        retrieved.pages
          .map(
            (p) =>
              `### ${p.title} (ID: ${p.id})\n${p.excerpt}`,
          )
          .join('\n\n');
    }

    // Build messages for AI SDK
    const messages: any[] = history.map((msg) => ({
      role: msg.role as 'user' | 'assistant',
      content: msg.content || '',
    }));

    const systemPrompt = this.buildSystemPrompt(
      contextText,
      params.contextPageId,
      languageFromLocale(user.locale),
    );

    // Stream the AI response (without SDK tools due to Zod v4 incompatibility)
    // Instead, editing is handled via command parsing from the AI response text
    const result = streamText({
      model: await this.providerFactory.getChatModel(workspaceId),
      system: systemPrompt,
      messages,
    });

    let fullResponse = '';

    for await (const chunk of (result as any).fullStream) {
      if (chunk.type === 'text-delta') {
        const text = chunk.textDelta ?? chunk.text ?? '';
        fullResponse += text;
        yield { type: 'content', text };
      }
    }

    // Parse and execute edit commands from the AI response
    const edits = await this.parseAndExecuteEditCommands(
      fullResponse,
      user,
      workspaceId,
    );

    const toolCalls: Array<Record<string, unknown>> = [
      {
        id: retrievalCallId,
        name: 'search_pages',
        args: { query: params.content },
        result: {
          method: retrieved.method,
          pages: retrieved.pages.map((p) => ({ id: p.id, title: p.title })),
        },
      },
    ];

    for (const [index, edit] of edits.entries()) {
      const callId = `edit-${chatId}-${history.length}-${index}`;
      const name =
        edit.action === 'title' ? 'update_page_title' : 'update_page';
      const result = edit.applied
        ? { status: 'applied' }
        : { status: 'refused', reason: edit.reason };

      yield { type: 'tool_call', id: callId, name, args: { pageId: edit.pageId } };
      yield { type: 'tool_result', id: callId, result };

      toolCalls.push({ id: callId, name, args: { pageId: edit.pageId }, result });
    }

    // The model has already claimed the edit was made by this point, so a
    // refusal has to be stated in the transcript — otherwise the user is left
    // believing a change landed when it did not.
    const refused = edits.filter((edit) => !edit.applied);
    if (refused.length > 0) {
      const notice = editRefusalNotice(user.locale, refused.length);
      fullResponse += `\n\n${notice}`;
      yield { type: 'content', text: `\n\n${notice}` };
    }

    // Save assistant message
    const assistantMsg = await this.db
      .insertInto('aiChatMessages')
      .values({
        chatId,
        workspaceId,
        role: 'assistant',
        content: fullResponse,
        // Persisted so the steps survive a page reload, not just the stream.
        toolCalls: JSON.stringify(toolCalls),
      })
      .returning(['id'])
      .executeTakeFirstOrThrow();

    // Auto-generate title if it's the first exchange
    if (!chat.title && history.length <= 1) {
      this.autoGenerateTitle(
        chatId,
        params.content,
        fullResponse,
        workspaceId,
      ).catch(() => {});
    }

    // Update chat timestamp
    await this.db
      .updateTable('aiChats')
      .set({ updatedAt: new Date() })
      .where('id', '=', chatId)
      .execute();

    yield { type: 'done', messageId: assistantMsg.id };
  }

  /**
   * Parse edit commands from AI response text and execute them.
   * Commands follow the format:
   * :::EDIT_PAGE:::
   * {"pageId":"...","content":"...","operation":"append|prepend|replace"}
   * :::END_EDIT:::
   *
   * Or for title updates:
   * :::UPDATE_TITLE:::
   * {"pageId":"...","title":"..."}
   * :::END_TITLE:::
   */
  private async parseAndExecuteEditCommands(
    responseText: string,
    user: User,
    workspaceId: string,
  ): Promise<EditOutcome[]> {
    const outcomes: EditOutcome[] = [];

    // Parse EDIT_PAGE commands
    const editRegex = /:::EDIT_PAGE:::\s*\n([\s\S]*?)\n:::END_EDIT:::/g;
    let match: RegExpExecArray | null;

    while ((match = editRegex.exec(responseText)) !== null) {
      let command: any;
      try {
        command = JSON.parse(match[1].trim());
      } catch {
        continue; // Skip malformed commands
      }

      if (!command?.pageId || !command?.content) continue;

      const page = await this.authorizeEdit(command.pageId, user, workspaceId);
      if (!page.allowed) {
        outcomes.push({
          pageId: command.pageId,
          action: 'content',
          applied: false,
          reason: page.reason,
        });
        continue;
      }

      try {
        await this.pageService.updatePageContent(
          command.pageId,
          command.content,
          (command.operation || 'append') as ContentOperation,
          'markdown',
          user,
        );
        outcomes.push({
          pageId: command.pageId,
          action: 'content',
          applied: true,
        });
      } catch (err: any) {
        outcomes.push({
          pageId: command.pageId,
          action: 'content',
          applied: false,
          reason: err?.message ?? 'The edit could not be applied',
        });
      }
    }

    // Parse UPDATE_TITLE commands
    const titleRegex = /:::UPDATE_TITLE:::\s*\n([\s\S]*?)\n:::END_TITLE:::/g;

    while ((match = titleRegex.exec(responseText)) !== null) {
      let command: any;
      try {
        command = JSON.parse(match[1].trim());
      } catch {
        continue;
      }

      if (!command?.pageId || !command?.title) continue;

      const page = await this.authorizeEdit(command.pageId, user, workspaceId);
      if (!page.allowed) {
        outcomes.push({
          pageId: command.pageId,
          action: 'title',
          applied: false,
          reason: page.reason,
        });
        continue;
      }

      await this.pageRepo.updatePage(
        { title: command.title, updatedAt: new Date() },
        command.pageId,
      );
      outcomes.push({ pageId: command.pageId, action: 'title', applied: true });
    }

    return outcomes;
  }

  /**
   * Pulls pages related to the question from the spaces the user belongs to.
   * Prefers semantic search when embeddings are configured and falls back to
   * PostgreSQL full-text search, so the assistant is not blind on installs
   * without an embedding key.
   */
  private async retrieveWikiContext(opts: {
    query: string;
    workspaceId: string;
    userId: string;
    excludePageIds: string[];
  }): Promise<{
    method: 'semantic' | 'text' | 'none';
    pages: Array<{ id: string; title: string; excerpt: string }>;
  }> {
    const { query, workspaceId, userId, excludePageIds } = opts;

    const trimmed = query.trim();
    if (trimmed.length < 3) return { method: 'none', pages: [] };

    const spaceIds = await this.spaceMemberRepo.getUserSpaceIds(userId);
    if (spaceIds.length === 0) return { method: 'none', pages: [] };

    const exclude = new Set(excludePageIds);

    try {
      if (await this.embeddingService.isConfigured(workspaceId)) {
        const hits = await this.embeddingService.search({
          query: trimmed,
          workspaceId,
          spaceIds,
          limit: RETRIEVAL_LIMIT + exclude.size,
        });

        const pages = hits
          .filter((hit) => !exclude.has(hit.pageId))
          .slice(0, RETRIEVAL_LIMIT)
          .map((hit) => ({
            id: hit.pageId,
            title: hit.title || 'Untitled',
            excerpt: hit.excerpt,
          }));

        if (pages.length > 0) return { method: 'semantic', pages };
      }
    } catch {
      // Provider or index trouble must not take the chat down with it.
    }

    try {
      const pages = await this.textSearchPages({
        query: trimmed,
        workspaceId,
        spaceIds,
        exclude,
      });
      if (pages.length > 0) return { method: 'text', pages };
    } catch {
      // Same reasoning as above.
    }

    return { method: 'none', pages: [] };
  }

  private async textSearchPages(opts: {
    query: string;
    workspaceId: string;
    spaceIds: string[];
    exclude: Set<string>;
  }): Promise<Array<{ id: string; title: string; excerpt: string }>> {
    const { query, workspaceId, spaceIds, exclude } = opts;

    // Prefix matching on every word, which is what makes short questions match
    // partial titles. Punctuation is stripped so it cannot break to_tsquery.
    //
    // The query must mirror how the pages trigger builds tsv — english
    // dictionary over f_unaccent — or accented words match nothing at all: the
    // index stores `producao`, so a query for `produção:*` finds no rows.
    const terms = query
      .replace(/[^\p{L}\p{N}\s]/gu, ' ')
      .split(/\s+/)
      .filter((word) => word.length > 2)
      .slice(0, 8)
      .map((word) => `${word}:*`)
      .join(' | ');

    if (!terms) return [];

    const rows = await this.db
      .selectFrom('pages')
      .select(['id', 'title', 'textContent'])
      .where('workspaceId', '=', workspaceId)
      .where('spaceId', 'in', spaceIds)
      .where('deletedAt', 'is', null)
      .where(sql<boolean>`tsv @@ to_tsquery('english', f_unaccent(${terms}))`)
      .orderBy(
        sql`ts_rank(tsv, to_tsquery('english', f_unaccent(${terms})))`,
        'desc',
      )
      .limit(RETRIEVAL_LIMIT + exclude.size)
      .execute();

    return rows
      .filter((row) => !exclude.has(row.id))
      .slice(0, RETRIEVAL_LIMIT)
      .map((row) => ({
        id: row.id,
        title: row.title || 'Untitled',
        excerpt: (row.textContent || '').slice(0, RETRIEVAL_EXCERPT),
      }));
  }

  /**
   * The pageId in an edit command comes from model-generated text, so it is
   * untrusted input: it must be confined to the caller's workspace and pass the
   * same page/space permission check the REST endpoint applies. The collaboration
   * path used by updatePageContent opens a direct Yjs connection, which skips
   * the authentication extension entirely — nothing downstream will catch this.
   */
  private async authorizeEdit(
    pageId: string,
    user: User,
    workspaceId: string,
  ): Promise<{ allowed: boolean; reason?: string; page?: Page }> {
    let page: Page | undefined;
    try {
      page = await this.pageRepo.findById(pageId);
    } catch {
      // A malformed id (not a uuid) throws rather than returning undefined.
      return { allowed: false, reason: 'Page not found' };
    }

    if (!page || page.deletedAt || page.workspaceId !== workspaceId) {
      return { allowed: false, reason: 'Page not found' };
    }

    try {
      await this.pageAccessService.validateCanEdit(page, user);
    } catch {
      return {
        allowed: false,
        reason: 'You do not have permission to edit this page',
      };
    }

    return { allowed: true, page };
  }

  private buildSystemPrompt(
    context: string,
    currentContextPageId?: string,
    language?: string,
  ): string {
    const appName = this.environmentService.getAppName();

    let prompt =
      `You are the AI assistant built into ${appName}, the company knowledge wiki. ` +
      `Users come to you to find, explain and maintain the documentation kept in ${appName}. ` +
      `Answer from the wiki content you are given, and say plainly when the wiki does not cover something ` +
      'instead of filling the gap with general knowledge presented as fact. ' +
      `Always write in ${language ?? 'Brazilian Portuguese (pt-BR)'}, ` +
      'unless the user writes to you in another language — then reply in the language they used. ' +
      'You can edit document pages directly. When the user asks you to edit, update, add text to, format, or modify a page, ' +
      'include an edit command block in your response using this exact format:\n\n' +
      ':::EDIT_PAGE:::\n' +
      '{"pageId":"PAGE_ID_HERE","content":"MARKDOWN_CONTENT_HERE","operation":"append"}\n' +
      ':::END_EDIT:::\n\n' +
      'The "operation" can be "append" (add to bottom), "prepend" (add to top), or "replace" (overwrite entire document).\n' +
      'To update a page title, use:\n\n' +
      ':::UPDATE_TITLE:::\n' +
      '{"pageId":"PAGE_ID_HERE","title":"NEW_TITLE_HERE"}\n' +
      ':::END_TITLE:::\n\n' +
      'Only edit a page the user asked you to change. Never use "replace" unless the user explicitly asks to ' +
      'rewrite or overwrite the whole page — it discards the current content. Prefer "append" or "prepend". ' +
      'An edit can be refused by the permission system; when that happens you are told so, and you must ' +
      'report it to the user rather than claiming the change was made.\n' +
      `You are capable of writing rich Markdown syntax that ${appName} renders into interactive UI elements:\n` +
      '- **Mermaid Diagrams**: Use ```mermaid code blocks for flowcharts, sequence diagrams, mindmaps, ERDs, and gantt charts.\n' +
      '- **Tables**: Use standard Markdown table syntax (| Header 1 | Header 2 |).\n' +
      '- **Code Blocks**: Use fenced code blocks with language identifiers (e.g., ```typescript, ```yaml, ```json, ```python).\n' +
      '- **Callouts/Alerts**: Use blockquotes with alert syntax (> [!NOTE], > [!TIP], > [!IMPORTANT], > [!WARNING], > [!CAUTION]).\n' +
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
    workspaceId: string,
  ) {
    try {
      if (!(await this.providerFactory.isConfigured(workspaceId))) return;

      const result = await generateText({
        model: await this.providerFactory.getCompletionModel(workspaceId),
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
