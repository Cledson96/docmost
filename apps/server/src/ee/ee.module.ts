import { Module } from '@nestjs/common';
import { BaseModule } from './base/base.module';
import { SearchAttachmentsModule } from './search-attachments/search-attachments.module';
import { TemplateModule } from './template/template.module';
import { AiModule } from './ai/ai.module';
import { AiChatModule } from './ai-chat/ai-chat.module';
import { PageVerificationModule } from './page-verification/page-verification.module';
import { McpModule } from './mcp/mcp.module';

@Module({
  imports: [
    BaseModule,
    SearchAttachmentsModule,
    TemplateModule,
    AiModule,
    AiChatModule,
    PageVerificationModule,
    McpModule,
  ],
})
export class EeModule {}

