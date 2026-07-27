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
import { sql } from 'kysely';

@UseGuards(JwtAuthGuard)
@Controller('ai')
export class AiAnswersController {
  constructor(
    @InjectKysely() private readonly db: KyselyDB,
    private readonly providerFactory: AiProviderFactory,
  ) {}

  @Post('answers')
  async aiAnswers(
    @Body() body: { query: string; spaceId?: string },
    @AuthUser() user: User,
    @AuthWorkspace() workspace: Workspace,
    @Res() res: Response,
  ) {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();

    try {
      if (!this.providerFactory.isConfigured()) {
        res.write(
          `data: ${JSON.stringify({ error: 'AI is not configured' })}\n\n`,
        );
        res.write('data: [DONE]\n\n');
        res.end();
        return;
      }

      // Search for relevant pages using text search
      const searchTerms = body.query
        .trim()
        .split(/\s+/)
        .map((word) => `${word}:*`)
        .join(' & ');

      let searchQuery = this.db
        .selectFrom('pages')
        .select(['id', 'title', 'slugId', 'content'])
        .where('workspaceId', '=', workspace.id)
        .where('deletedAt', 'is', null)
        .where(
          sql<boolean>`tsv @@ to_tsquery('english', ${searchTerms})`,
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
        res.write(`data: ${JSON.stringify({ sources })}\n\n`);
      }

      // Build context
      const context = pages
        .map((p) => `## ${p.title}\n${this.extractText(p.content).substring(0, 2000)}`)
        .join('\n\n');

      // Stream AI response
      const result = streamText({
        model: this.providerFactory.getChatModel(),
        system:
          'You are a helpful assistant that answers questions based on the provided document context. ' +
          'Use the document content to provide accurate answers. If the documents do not contain ' +
          'relevant information, say so honestly. Format your response using Markdown.',
        prompt: `Context documents:\n\n${context}\n\nQuestion: ${body.query}`,
      });

      for await (const chunk of result.textStream) {
        res.write(`data: ${JSON.stringify({ content: chunk })}\n\n`);
      }

      res.write('data: [DONE]\n\n');
    } catch (error: any) {
      res.write(
        `data: ${JSON.stringify({ error: error?.message || 'An error occurred' })}\n\n`,
      );
      res.write('data: [DONE]\n\n');
    } finally {
      res.end();
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
