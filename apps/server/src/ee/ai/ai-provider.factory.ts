import { Injectable, BadRequestException } from '@nestjs/common';
import { createOpenAI } from '@ai-sdk/openai';
import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { createOllama } from 'ai-sdk-ollama';
import { LanguageModel } from 'ai';
import {
  AiSettingsService,
  ResolvedAiConfig,
} from './ai-settings.service';

@Injectable()
export class AiProviderFactory {
  constructor(private readonly aiSettingsService: AiSettingsService) {}

  async isConfigured(workspaceId: string): Promise<boolean> {
    return this.aiSettingsService.isConfigured(workspaceId);
  }

  async getCompletionModel(workspaceId: string): Promise<LanguageModel> {
    const config = await this.aiSettingsService.resolve(workspaceId);
    return this.createModel(config, config.completionModel);
  }

  async getChatModel(workspaceId: string): Promise<LanguageModel> {
    const config = await this.aiSettingsService.resolve(workspaceId);
    return this.createModel(config, config.chatModel);
  }

  /** Used by the settings screen to exercise a config before relying on it. */
  createModel(config: ResolvedAiConfig, modelId?: string): LanguageModel {
    if (!config.driver) {
      throw new BadRequestException(
        'AI is not configured. Set it up in Settings → AI, or set AI_DRIVER in your environment.',
      );
    }

    const effectiveModel =
      modelId ||
      config.completionModel ||
      this.aiSettingsService.defaultModelFor(config.driver);

    switch (config.driver) {
      // OpenRouter and any other OpenAI-compatible gateway differ from OpenAI
      // only by base URL, which resolve() has already filled in.
      case 'openai':
      case 'openrouter':
      case 'openai-compatible': {
        const openai = createOpenAI({
          apiKey: config.apiKey,
          baseURL: config.baseUrl || undefined,
        });
        return openai.chat(effectiveModel);
      }
      case 'gemini': {
        const google = createGoogleGenerativeAI({
          apiKey: config.apiKey,
        });
        return google(effectiveModel);
      }
      case 'ollama': {
        const ollama = createOllama({
          baseURL: config.baseUrl,
        });
        return ollama(effectiveModel);
      }
      default:
        throw new BadRequestException(`Unknown AI driver: ${config.driver}`);
    }
  }
}
