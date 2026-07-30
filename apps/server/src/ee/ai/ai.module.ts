import { Module } from '@nestjs/common';
import { AiController } from './ai.controller';
import { AiAnswersController } from './ai-answers.controller';
import { AiService } from './ai.service';
import { AiSettingsModule } from './ai-settings.module';

@Module({
  imports: [AiSettingsModule],
  controllers: [AiController, AiAnswersController],
  providers: [AiService],
  exports: [AiService, AiSettingsModule],
})
export class AiModule {}
