import { Injectable, BadRequestException } from '@nestjs/common';
import { EnvironmentService } from '../../integrations/environment/environment.service';
import { createOpenAI } from '@ai-sdk/openai';
import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { createOllama } from 'ai-sdk-ollama';
import { LanguageModel } from 'ai';

@Injectable()
export class AiProviderFactory {
  constructor(private readonly envService: EnvironmentService) {}

  isConfigured(): boolean {
    const driver = this.envService.getAiDriver();
    if (!driver) return false;
    if (driver === 'openai' || driver === 'openai-compatible') {
      return !!this.envService.getOpenAiApiKey();
    }
    if (driver === 'gemini') {
      return !!this.envService.getGeminiApiKey();
    }
    if (driver === 'ollama') {
      return !!this.envService.getOllamaApiUrl();
    }
    return false;
  }

  getCompletionModel(): LanguageModel {
    return this.createModel(this.envService.getAiCompletionModel());
  }

  getChatModel(): LanguageModel {
    return this.createModel(this.envService.getAiChatModel());
  }

  private createModel(modelId?: string) {
    const driver = this.envService.getAiDriver();

    if (!driver) {
      throw new BadRequestException(
        'AI is not configured. Please set AI_DRIVER in your environment.',
      );
    }

    const defaultModel =
      driver === 'gemini'
        ? 'gemini-1.5-flash'
        : driver === 'ollama'
          ? 'llama3.2'
          : 'gpt-4o-mini';

    const effectiveModel = modelId || defaultModel;

    switch (driver) {
      case 'openai': {
        const openai = createOpenAI({
          apiKey: this.envService.getOpenAiApiKey(),
          baseURL: this.envService.getOpenAiApiUrl() || undefined,
        });
        return openai(effectiveModel);
      }
      case 'openai-compatible': {
        const openai = createOpenAI({
          apiKey: this.envService.getOpenAiApiKey(),
          baseURL: this.envService.getOpenAiApiUrl(),
        });
        return openai(effectiveModel);
      }
      case 'gemini': {
        const google = createGoogleGenerativeAI({
          apiKey: this.envService.getGeminiApiKey(),
        });
        return google(effectiveModel);
      }
      case 'ollama': {
        const ollama = createOllama({
          baseURL: this.envService.getOllamaApiUrl(),
        });
        return ollama(effectiveModel);
      }
      default:
        throw new BadRequestException(`Unknown AI driver: ${driver}`);
    }
  }
}
