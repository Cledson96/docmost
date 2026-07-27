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
    return !!this.envService.getAiDriver();
  }

  getCompletionModel(): LanguageModel {
    return this.createModel(this.envService.getAiCompletionModel());
  }

  getChatModel(): LanguageModel {
    return this.createModel(this.envService.getAiChatModel());
  }

  private createModel(modelId: string) {
    const driver = this.envService.getAiDriver();

    if (!driver) {
      throw new BadRequestException(
        'AI is not configured. Please set AI_DRIVER in your environment.',
      );
    }

    switch (driver) {
      case 'openai': {
        const openai = createOpenAI({
          apiKey: this.envService.getOpenAiApiKey(),
          baseURL: this.envService.getOpenAiApiUrl() || undefined,
        });
        return openai(modelId);
      }
      case 'openai-compatible': {
        const openai = createOpenAI({
          apiKey: this.envService.getOpenAiApiKey(),
          baseURL: this.envService.getOpenAiApiUrl(),
        });
        return openai(modelId);
      }
      case 'gemini': {
        const google = createGoogleGenerativeAI({
          apiKey: this.envService.getGeminiApiKey(),
        });
        return google(modelId);
      }
      case 'ollama': {
        const ollama = createOllama({
          baseURL: this.envService.getOllamaApiUrl(),
        });
        return ollama(modelId);
      }
      default:
        throw new BadRequestException(`Unknown AI driver: ${driver}`);
    }
  }
}
