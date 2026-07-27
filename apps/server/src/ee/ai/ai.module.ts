import { Module } from '@nestjs/common';
import { AiController } from './ai.controller';
import { AiAnswersController } from './ai-answers.controller';
import { AiService } from './ai.service';
import { AiProviderFactory } from './ai-provider.factory';

@Module({
  controllers: [AiController, AiAnswersController],
  providers: [AiService, AiProviderFactory],
  exports: [AiService, AiProviderFactory],
})
export class AiModule {}

