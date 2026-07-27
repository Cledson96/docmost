import { Module } from '@nestjs/common';
import { AiChatController } from './ai-chat.controller';
import { AiChatService } from './ai-chat.service';
import { AiModule } from '../ai/ai.module';
import { PageModule } from '../../core/page/page.module';

@Module({
  imports: [AiModule, PageModule],
  controllers: [AiChatController],
  providers: [AiChatService],
})
export class AiChatModule {}
