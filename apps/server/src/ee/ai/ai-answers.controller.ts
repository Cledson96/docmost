import {
  Body,
  Controller,
  Post,
  Res,
  UseGuards,
} from '@nestjs/common';
import { Response } from 'express';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { AuthUser } from '../../common/decorators/auth-user.decorator';
import { AuthWorkspace } from '../../common/decorators/auth-workspace.decorator';
import { User, Workspace } from '@docmost/db/types/entity.types';
import { InjectKysely } from 'nestjs-kysely';
import { KyselyDB } from '@docmost/db/types/kysely.types';
import { streamText } from 'ai';
import { AiProviderFactory } from './ai-provider.factory';
import { languageFromLocale } from './ai-language.util';
import { EnvironmentService } from '../../integrations/environment/environment.service';
import { sql } from 'kysely';

@UseGuards(JwtAuthGuard)
@Controller('ai')
export class AiAnswersController {
  constructor(
    @InjectKysely() private readonly db: KyselyDB,
    private readonly providerFactory: AiProviderFactory,
    private readonly environmentService: EnvironmentService,
  ) {}

  @Post('answers')
  async aiAnswers(
    @Body() body: { query: string; spaceId?: string },
    @AuthUser() user: User,
    @AuthWorkspace() workspace: Workspace,
    @Res() res: Response,
  ) {
    const raw = (res as any).raw || res;
    raw.setHeader('Content-Type', 'text/event-stream');
    raw.setHeader('Cache-Control', 'no-cache');
    raw.setHeader('Connection', 'keep-alive');
    if (typeof raw.flushHeaders === 'function') {
      raw.flushHeaders();
    }

    try {
      if (!(await this.providerFactory.isConfigured(workspace.id))) {
        raw.write(
          `data: ${JSON.stringify({ error: 'AI is not configured' })}\n\n`,
        );
        raw.write('data: [DONE]\n\n');
        raw.end();
        return;
      }

      // Search for relevant pages using text search. Punctuation is stripped
      // because to_tsquery throws a syntax error on characters it reads as
      // operators — `runbook: banco (produção)`, `deploy!` and `custo <> valor`
      // all failed before this.
      //
      // The query mirrors how the pages trigger builds tsv — english dictionary
      // over f_unaccent, the same shape SearchService uses. Without f_unaccent
      // every accented word silently matched nothing, since the index stores
      // `producao` while the query asked for `produção`.
      const searchTerms = body.query
        .replace(/[^\p{L}\p{N}\s]/gu, ' ')
        .trim()
        .split(/\s+/)
        .filter((word) => word.length > 0)
        .map((word) => `${word}:*`)
        .join(' | ');

      if (!searchTerms) {
        raw.write(
          `data: ${JSON.stringify({ error: 'Empty query' })}\n\n`,
        );
        raw.write('data: [DONE]\n\n');
        raw.end();
        return;
      }

      let searchQuery = this.db
        .selectFrom('pages')
        .select(['id', 'title', 'slugId', 'content'])
        .where('workspaceId', '=', workspace.id)
        .where('deletedAt', 'is', null)
        .where(
          sql<boolean>`tsv @@ to_tsquery('english', f_unaccent(${searchTerms}))`,
        )
        .limit(5);

      if (body.spaceId) {
        searchQuery = searchQuery.where('spaceId', '=', body.spaceId);
      }

      const pages = await searchQuery.execute();

      // Get space slugs for sources
      const sources = [];
      for (const page of pages) {
        const space = await this.db
          .selectFrom('spaces')
          .select(['slug'])
          .innerJoin('pages', 'pages.spaceId', 'spaces.id')
          .where('pages.id', '=', page.id)
          .executeTakeFirst();

        const textContent = this.extractText(page.content);
        sources.push({
          pageId: page.id,
          title: page.title,
          slugId: page.slugId,
          spaceSlug: space?.slug || '',
          similarity: 1,
          distance: 0,
          chunkIndex: 0,
          excerpt: textContent.substring(0, 200),
        });
      }

      // Send sources
      if (sources.length > 0) {
        raw.write(`data: ${JSON.stringify({ sources })}\n\n`);
      }

      // Build context
      const context = pages
        .map((p) => `## ${p.title}\n${this.extractText(p.content).substring(0, 2000)}`)
        .join('\n\n');

      // Stream AI response
      const result = streamText({
        model: await this.providerFactory.getChatModel(workspace.id),
        system:
          `You answer questions about ${this.environmentService.getAppName()}, the company knowledge wiki, ` +
          'using only the document context provided below. ' +
          'If the documents do not contain relevant information, say so honestly instead of answering from ' +
          'general knowledge. Format your response using Markdown. ' +
          `Write your answer in ${languageFromLocale(user.locale)}, unless the question is asked in another ` +
          'language — then answer in the language of the question.',
        prompt: `Context documents:\n\n${context}\n\nQuestion: ${body.query}`,
      });

      for await (const chunk of result.textStream) {
        raw.write(`data: ${JSON.stringify({ content: chunk })}\n\n`);
      }

      raw.write('data: [DONE]\n\n');
    } catch (error: any) {
      raw.write(
        `data: ${JSON.stringify({ error: error?.message || 'An error occurred' })}\n\n`,
      );
      raw.write('data: [DONE]\n\n');
    } finally {
      raw.end();
    }
  }

  private extractText(content: any): string {
    if (!content) return '';
    if (typeof content === 'string') return content;

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
    if (node.text) text += node.text;
    if (node.content && Array.isArray(node.content)) {
      for (const child of node.content) {
        text += this.extractTextFromNode(child);
      }
      if (['paragraph', 'heading', 'listItem'].includes(node.type)) {
        text += '\n';
      }
    }
    return text;
  }
}
