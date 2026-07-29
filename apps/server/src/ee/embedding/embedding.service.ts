import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { InjectKysely } from 'nestjs-kysely';
import { KyselyDB } from '@docmost/db/types/kysely.types';
import { sql } from 'kysely';
import { embed, embedMany } from 'ai';
import { createOpenAI } from '@ai-sdk/openai';
import { EnvironmentService } from '../../integrations/environment/environment.service';
import { chunkText } from './chunk-text';

/** Must match the dimension pinned by the page_embeddings migration. */
export const EMBEDDING_DIMENSION = 1536;
const DEFAULT_EMBEDDING_MODEL = 'text-embedding-3-small';

@Injectable()
export class EmbeddingService {
  private readonly logger = new Logger(EmbeddingService.name);

  constructor(
    @InjectKysely() private readonly db: KyselyDB,
    private readonly environmentService: EnvironmentService,
  ) {}

  isConfigured(): boolean {
    return Boolean(this.environmentService.getOpenAiApiKey());
  }

  private modelName(): string {
    return (
      this.environmentService.getAiEmbeddingModel() || DEFAULT_EMBEDDING_MODEL
    );
  }

  /**
   * Embeddings go into a fixed-width column, so a model whose output does not
   * match is a configuration error worth failing loudly on rather than
   * silently indexing nothing.
   */
  private embeddingModel() {
    const apiKey = this.environmentService.getOpenAiApiKey();
    if (!apiKey) {
      throw new BadRequestException(
        'Semantic search needs OPENAI_API_KEY to be set.',
      );
    }

    const configured = this.environmentService.getAiEmbeddingDimension();
    if (!Number.isNaN(configured) && configured !== EMBEDDING_DIMENSION) {
      throw new BadRequestException(
        `AI_EMBEDDING_DIMENSION is ${configured} but the page_embeddings column is ${EMBEDDING_DIMENSION}. Change the variable or migrate the column.`,
      );
    }

    const openai = createOpenAI({
      apiKey,
      baseURL: this.environmentService.getOpenAiApiUrl() || undefined,
    });

    return openai.textEmbeddingModel(this.modelName());
  }

  /** Rebuild the embeddings for one page. No-op for pages with no text. */
  async indexPage(pageId: string): Promise<{ chunks: number }> {
    const page = await this.db
      .selectFrom('pages')
      .select(['id', 'title', 'textContent', 'spaceId', 'workspaceId', 'deletedAt'])
      .where('id', '=', pageId)
      .executeTakeFirst();

    if (!page || page.deletedAt) {
      await this.removePage(pageId);
      return { chunks: 0 };
    }

    // The title carries a lot of the meaning of a wiki page, so it is
    // prepended to every chunk rather than embedded once on its own.
    const body = (page.textContent || '').trim();
    const chunks = chunkText(body);

    if (chunks.length === 0) {
      await this.removePage(pageId);
      return { chunks: 0 };
    }

    const title = page.title || 'Untitled';
    const inputs = chunks.map((chunk) => `${title}\n\n${chunk.text}`);

    const { embeddings } = await embedMany({
      model: this.embeddingModel(),
      values: inputs,
    });

    const modelName = this.modelName();

    // Delete-then-insert inside one transaction: a page must never be left
    // with a mix of old and new chunks if the insert fails halfway.
    await this.db.transaction().execute(async (trx) => {
      await trx
        .deleteFrom('pageEmbeddings')
        .where('pageId', '=', pageId)
        .execute();

      await trx
        .insertInto('pageEmbeddings')
        .values(
          chunks.map((chunk, i) => ({
            pageId: page.id,
            spaceId: page.spaceId,
            workspaceId: page.workspaceId,
            modelName,
            modelDimensions: EMBEDDING_DIMENSION,
            embedding: sql`${JSON.stringify(embeddings[i])}::vector`,
            chunkIndex: i,
            chunkStart: chunk.start,
            chunkLength: chunk.text.length,
            metadata: JSON.stringify({ title }),
          })) as any,
        )
        .execute();
    });

    return { chunks: chunks.length };
  }

  async removePage(pageId: string): Promise<void> {
    await this.db
      .deleteFrom('pageEmbeddings')
      .where('pageId', '=', pageId)
      .execute();
  }

  /**
   * Nearest chunks by cosine distance, restricted to the given spaces.
   * Returns one row per page — the best-scoring chunk — so the caller is not
   * handed five fragments of the same document.
   */
  async search(opts: {
    query: string;
    workspaceId: string;
    spaceIds: string[];
    limit: number;
  }) {
    const { query, workspaceId, spaceIds, limit } = opts;

    if (spaceIds.length === 0) return [];

    const { embedding } = await embed({
      model: this.embeddingModel(),
      value: query,
    });

    const vector = sql`${JSON.stringify(embedding)}::vector`;

    const rows = await this.db
      .selectFrom('pageEmbeddings')
      .innerJoin('pages', 'pages.id', 'pageEmbeddings.pageId')
      .select([
        'pageEmbeddings.pageId',
        'pageEmbeddings.chunkIndex',
        'pageEmbeddings.chunkStart',
        'pageEmbeddings.chunkLength',
        'pages.title',
        'pages.slugId',
        'pages.spaceId',
        'pages.textContent',
        sql<number>`1 - (page_embeddings.embedding <=> ${vector})`.as(
          'similarity',
        ),
      ])
      .where('pageEmbeddings.workspaceId', '=', workspaceId)
      .where('pageEmbeddings.spaceId', 'in', spaceIds)
      .where('pages.deletedAt', 'is', null)
      // Over-fetch: several chunks of one page can crowd the top, and the
      // caller still has to drop pages the user cannot read.
      .orderBy(sql`page_embeddings.embedding <=> ${vector}`)
      .limit(limit * 5)
      .execute();

    const bestPerPage = new Map<string, (typeof rows)[number]>();
    for (const row of rows) {
      if (!bestPerPage.has(row.pageId)) bestPerPage.set(row.pageId, row);
    }

    return [...bestPerPage.values()].map((row) => ({
      pageId: row.pageId,
      slugId: row.slugId,
      title: row.title,
      spaceId: row.spaceId,
      similarity: Number(row.similarity.toFixed(4)),
      excerpt: (row.textContent || '')
        .slice(row.chunkStart, row.chunkStart + row.chunkLength)
        .trim()
        .slice(0, 400),
    }));
  }

  /** Pages in the workspace that have no embeddings yet. */
  async findUnindexedPageIds(
    workspaceId: string,
    limit: number,
  ): Promise<string[]> {
    const rows = await this.db
      .selectFrom('pages')
      .select('pages.id')
      .where('pages.workspaceId', '=', workspaceId)
      .where('pages.deletedAt', 'is', null)
      .where((eb) =>
        eb.not(
          eb.exists(
            eb
              .selectFrom('pageEmbeddings')
              .select('pageEmbeddings.id')
              .whereRef('pageEmbeddings.pageId', '=', 'pages.id'),
          ),
        ),
      )
      .limit(limit)
      .execute();

    return rows.map((r) => r.id);
  }

  async countIndexedPages(workspaceId: string): Promise<number> {
    const row = await this.db
      .selectFrom('pageEmbeddings')
      .select((eb) => eb.fn.count<string>('pageId').distinct().as('count'))
      .where('workspaceId', '=', workspaceId)
      .executeTakeFirst();

    return Number(row?.count ?? 0);
  }
}
