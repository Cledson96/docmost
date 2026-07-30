import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { WorkspaceAiSettingsRepo } from '@docmost/db/repos/workspace/workspace-ai-settings.repo';
import { EnvironmentService } from '../../integrations/environment/environment.service';
import { decryptSecret, encryptSecret, maskSecret } from './ai-secret.util';
import { UpdateAiSettingsDto } from './dto/update-ai-settings.dto';

export const AI_DRIVERS = [
  'openai',
  'openrouter',
  'openai-compatible',
  'gemini',
  'ollama',
] as const;

export type AiDriver = (typeof AI_DRIVERS)[number];

export const OPENROUTER_BASE_URL = 'https://openrouter.ai/api/v1';
const OPENAI_BASE_URL = 'https://api.openai.com/v1';
const OLLAMA_DEFAULT_URL = 'http://localhost:11434';
const GEMINI_MODELS_URL =
  'https://generativelanguage.googleapis.com/v1beta/models';

const DEFAULT_MODELS: Record<AiDriver, string> = {
  openai: 'gpt-4o-mini',
  openrouter: 'openai/gpt-4o-mini',
  'openai-compatible': 'gpt-4o-mini',
  gemini: 'gemini-1.5-flash',
  ollama: 'llama3.2',
};

/** Everything the provider factory needs, with env fallbacks already applied. */
export interface ResolvedAiConfig {
  driver: AiDriver | '';
  baseUrl: string | null;
  apiKey: string | null;
  chatModel: string;
  completionModel: string;
  /** True when the config came from the database rather than the environment. */
  fromDatabase: boolean;
}

export interface ResolvedEmbeddingConfig {
  baseUrl: string | null;
  apiKey: string | null;
  model: string | null;
}

/** Admin-facing view: never carries a usable secret. */
export interface AiSettingsView {
  driver: AiDriver | '';
  baseUrl: string | null;
  chatModel: string | null;
  completionModel: string | null;
  embeddingBaseUrl: string | null;
  embeddingModel: string | null;
  apiKeyPreview: string | null;
  embeddingApiKeyPreview: string | null;
  hasApiKey: boolean;
  hasEmbeddingApiKey: boolean;
  /** Which fields are still coming from the environment. */
  managedByEnv: boolean;
  configured: boolean;
}

@Injectable()
export class AiSettingsService {
  private readonly logger = new Logger(AiSettingsService.name);

  constructor(
    private readonly repo: WorkspaceAiSettingsRepo,
    private readonly environmentService: EnvironmentService,
  ) {}

  /* ------------------------------------------------------------------ read */

  async resolve(workspaceId: string): Promise<ResolvedAiConfig> {
    const row = await this.repo.findByWorkspaceId(workspaceId);
    const appSecret = this.environmentService.getAppSecret();

    const storedKey = row
      ? decryptSecret(row.apiKeyEncrypted, appSecret)
      : null;

    const driver = (row?.driver ||
      this.environmentService.getAiDriver()) as AiDriver | '';

    if (!driver) {
      return {
        driver: '',
        baseUrl: null,
        apiKey: null,
        chatModel: '',
        completionModel: '',
        fromDatabase: false,
      };
    }

    const apiKey =
      storedKey ??
      (driver === 'gemini'
        ? this.environmentService.getGeminiApiKey()
        : this.environmentService.getOpenAiApiKey()) ??
      null;

    const baseUrl = this.effectiveBaseUrl(driver, row?.baseUrl);

    const completionModel =
      row?.completionModel ||
      this.environmentService.getAiCompletionModel() ||
      DEFAULT_MODELS[driver];

    const chatModel =
      row?.chatModel ||
      this.environmentService.getAiChatModel() ||
      completionModel;

    return {
      driver,
      baseUrl,
      apiKey,
      chatModel,
      completionModel,
      fromDatabase: Boolean(row?.driver),
    };
  }

  /**
   * Embeddings resolve separately from chat on purpose: providers such as
   * OpenRouter serve chat completions but no embeddings endpoint, so pointing
   * chat at them must not drag semantic search along.
   */
  async resolveEmbedding(workspaceId: string): Promise<ResolvedEmbeddingConfig> {
    const row = await this.repo.findByWorkspaceId(workspaceId);
    const appSecret = this.environmentService.getAppSecret();

    const storedKey = row
      ? decryptSecret(row.embeddingApiKeyEncrypted, appSecret)
      : null;

    // An OpenAI-flavoured chat config doubles as the embedding config when no
    // dedicated embedding credentials were entered.
    const chatFallbackKey =
      row?.driver === 'openai' || row?.driver === 'openai-compatible'
        ? decryptSecret(row.apiKeyEncrypted, appSecret)
        : null;

    return {
      baseUrl:
        row?.embeddingBaseUrl ||
        this.environmentService.getOpenAiApiUrl() ||
        null,
      apiKey:
        storedKey ??
        chatFallbackKey ??
        this.environmentService.getOpenAiApiKey() ??
        null,
      model: row?.embeddingModel || null,
    };
  }

  async getView(workspaceId: string): Promise<AiSettingsView> {
    const row = await this.repo.findByWorkspaceId(workspaceId);
    const appSecret = this.environmentService.getAppSecret();
    const resolved = await this.resolve(workspaceId);

    const storedKey = row ? decryptSecret(row.apiKeyEncrypted, appSecret) : null;
    const storedEmbeddingKey = row
      ? decryptSecret(row.embeddingApiKeyEncrypted, appSecret)
      : null;

    return {
      driver: (row?.driver as AiDriver) || '',
      baseUrl: row?.baseUrl ?? null,
      chatModel: row?.chatModel ?? null,
      completionModel: row?.completionModel ?? null,
      embeddingBaseUrl: row?.embeddingBaseUrl ?? null,
      embeddingModel: row?.embeddingModel ?? null,
      apiKeyPreview: maskSecret(storedKey),
      embeddingApiKeyPreview: maskSecret(storedEmbeddingKey),
      hasApiKey: Boolean(storedKey),
      hasEmbeddingApiKey: Boolean(storedEmbeddingKey),
      managedByEnv: !row?.driver && Boolean(this.environmentService.getAiDriver()),
      configured: this.isUsable(resolved),
    };
  }

  isUsable(config: ResolvedAiConfig): boolean {
    if (!config.driver) return false;
    if (config.driver === 'ollama') return Boolean(config.baseUrl);
    return Boolean(config.apiKey);
  }

  async isConfigured(workspaceId: string): Promise<boolean> {
    return this.isUsable(await this.resolve(workspaceId));
  }

  /* ----------------------------------------------------------------- write */

  async update(
    workspaceId: string,
    dto: UpdateAiSettingsDto,
  ): Promise<AiSettingsView> {
    const appSecret = this.environmentService.getAppSecret();
    const values: Record<string, unknown> = {};

    if (dto.driver !== undefined) {
      values.driver = dto.driver || null;
    }
    if (dto.baseUrl !== undefined) {
      values.baseUrl = dto.baseUrl?.trim() ? dto.baseUrl.trim() : null;
    }
    if (dto.chatModel !== undefined) {
      values.chatModel = dto.chatModel?.trim() || null;
    }
    if (dto.completionModel !== undefined) {
      values.completionModel = dto.completionModel?.trim() || null;
    }
    if (dto.embeddingBaseUrl !== undefined) {
      values.embeddingBaseUrl = dto.embeddingBaseUrl?.trim() || null;
    }
    if (dto.embeddingModel !== undefined) {
      values.embeddingModel = dto.embeddingModel?.trim() || null;
    }

    // An omitted key keeps the stored one; an explicit empty string clears it.
    if (dto.apiKey !== undefined) {
      values.apiKeyEncrypted = dto.apiKey
        ? encryptSecret(dto.apiKey.trim(), appSecret)
        : null;
    }
    if (dto.embeddingApiKey !== undefined) {
      values.embeddingApiKeyEncrypted = dto.embeddingApiKey
        ? encryptSecret(dto.embeddingApiKey.trim(), appSecret)
        : null;
    }

    if (Object.keys(values).length > 0) {
      values.updatedAt = new Date();
      await this.repo.upsert(workspaceId, values as any);
    }

    return this.getView(workspaceId);
  }

  async reset(workspaceId: string): Promise<AiSettingsView> {
    await this.repo.deleteByWorkspaceId(workspaceId);
    return this.getView(workspaceId);
  }

  /* ---------------------------------------------------------------- models */

  /**
   * Lists the models the configured provider actually offers. Uses the pending
   * values from the form when supplied, so an admin can browse models before
   * saving a new key.
   */
  async listModels(
    workspaceId: string,
    override?: {
      driver?: string;
      baseUrl?: string;
      apiKey?: string;
      kind?: string;
    },
  ): Promise<{ models: Array<{ id: string; label: string }> }> {
    if (override?.kind === 'embedding') {
      return this.listEmbeddingModels(workspaceId, override);
    }

    const resolved = await this.resolve(workspaceId);

    const driver = (override?.driver || resolved.driver) as AiDriver | '';
    if (!driver) {
      throw new BadRequestException('Select a provider first.');
    }

    const baseUrl = this.effectiveBaseUrl(
      driver,
      override?.baseUrl?.trim() || null,
      resolved.baseUrl,
    );
    const apiKey = override?.apiKey?.trim() || resolved.apiKey;

    if (driver !== 'ollama' && !apiKey) {
      throw new BadRequestException('Enter an API key first.');
    }

    try {
      if (driver === 'gemini') {
        const body = await this.fetchJson(
          `${GEMINI_MODELS_URL}?key=${encodeURIComponent(apiKey)}`,
        );
        const models = (body?.models ?? [])
          .filter((m: any) =>
            (m.supportedGenerationMethods ?? []).includes('generateContent'),
          )
          .map((m: any) => ({
            id: String(m.name).replace(/^models\//, ''),
            label: m.displayName || String(m.name).replace(/^models\//, ''),
          }));
        return { models: this.sortModels(models) };
      }

      if (driver === 'ollama') {
        const body = await this.fetchJson(`${this.trimSlash(baseUrl)}/api/tags`);
        const models = (body?.models ?? []).map((m: any) => ({
          id: m.name,
          label: m.name,
        }));
        return { models: this.sortModels(models) };
      }

      // OpenAI, OpenRouter and anything OpenAI-compatible expose GET /models.
      const body = await this.fetchJson(`${this.trimSlash(baseUrl)}/models`, {
        Authorization: `Bearer ${apiKey}`,
      });
      const models = (body?.data ?? []).map((m: any) => ({
        id: m.id,
        label: m.name || m.id,
      }));
      return { models: this.sortModels(models) };
    } catch (err: any) {
      this.logger.warn(`Listing ${driver} models failed: ${err?.message}`);
      throw new BadRequestException(
        `Could not list models from the provider: ${err?.message ?? 'request failed'}`,
      );
    }
  }

  /**
   * Embedding models always come from the OpenAI-compatible endpoint configured
   * for embeddings, which is a different provider from chat whenever chat runs
   * through a gateway that has no embeddings API.
   */
  private async listEmbeddingModels(
    workspaceId: string,
    override?: { baseUrl?: string; apiKey?: string },
  ): Promise<{ models: Array<{ id: string; label: string }> }> {
    const embedding = await this.resolveEmbedding(workspaceId);

    const apiKey = override?.apiKey?.trim() || embedding.apiKey;
    if (!apiKey) {
      throw new BadRequestException('Enter an embedding API key first.');
    }

    const baseUrl =
      override?.baseUrl?.trim() || embedding.baseUrl || OPENAI_BASE_URL;

    try {
      const body = await this.fetchJson(`${this.trimSlash(baseUrl)}/models`, {
        Authorization: `Bearer ${apiKey}`,
      });
      const models = (body?.data ?? [])
        .filter((m: any) => String(m.id).includes('embedding'))
        .map((m: any) => ({ id: m.id, label: m.name || m.id }));
      return { models: this.sortModels(models) };
    } catch (err: any) {
      this.logger.warn(`Listing embedding models failed: ${err?.message}`);
      throw new BadRequestException(
        `Could not list embedding models: ${err?.message ?? 'request failed'}`,
      );
    }
  }

  /** Round-trips a tiny completion so admins get a real answer, not a guess. */
  async testConnection(
    workspaceId: string,
    modelFactory: (config: ResolvedAiConfig) => Promise<string>,
  ): Promise<{ ok: boolean; message: string }> {
    const resolved = await this.resolve(workspaceId);

    if (!this.isUsable(resolved)) {
      return { ok: false, message: 'AI is not configured yet.' };
    }

    try {
      const reply = await modelFactory(resolved);
      return {
        ok: true,
        message: `Connected to ${resolved.driver} using ${resolved.chatModel}. Reply: ${reply.slice(0, 60)}`,
      };
    } catch (err: any) {
      return {
        ok: false,
        message: err?.message ?? 'The provider rejected the request.',
      };
    }
  }

  /* --------------------------------------------------------------- helpers */

  /**
   * OpenRouter and Ollama have a canonical URL, so admins only need to supply
   * one for a generic OpenAI-compatible gateway.
   */
  effectiveBaseUrl(
    driver: AiDriver | '',
    ...candidates: Array<string | null | undefined>
  ): string | null {
    const explicit = candidates.find((c) => c && c.trim().length > 0);
    if (explicit) return explicit.trim();

    if (driver === 'openrouter') return OPENROUTER_BASE_URL;
    if (driver === 'ollama') {
      return this.environmentService.getOllamaApiUrl() || OLLAMA_DEFAULT_URL;
    }
    if (driver === 'openai' || driver === 'openai-compatible') {
      return this.environmentService.getOpenAiApiUrl() || null;
    }
    return null;
  }

  defaultModelFor(driver: AiDriver): string {
    return DEFAULT_MODELS[driver];
  }

  private trimSlash(url: string | null): string {
    if (!url) throw new Error('Missing provider base URL');
    return url.replace(/\/+$/, '');
  }

  private async fetchJson(url: string, headers: Record<string, string> = {}) {
    const response = await fetch(url, {
      headers: { Accept: 'application/json', ...headers },
      signal: AbortSignal.timeout(15_000),
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status} ${response.statusText}`);
    }

    return response.json() as any;
  }

  private sortModels(models: Array<{ id: string; label: string }>) {
    return models
      .filter((m) => m.id)
      .sort((a, b) => a.id.localeCompare(b.id));
  }
}
