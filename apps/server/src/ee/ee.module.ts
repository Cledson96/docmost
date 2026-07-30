import { Module } from '@nestjs/common';
import { BaseModule } from './base/base.module';
import { SearchAttachmentsModule } from './search-attachments/search-attachments.module';
import { TemplateModule } from './template/template.module';
import { AiModule } from './ai/ai.module';
import { AiChatModule } from './ai-chat/ai-chat.module';
import { PageVerificationModule } from './page-verification/page-verification.module';
import { McpModule } from './mcp/mcp.module';
import { EmbeddingModule } from './embedding/embedding.module';
import { PdfExportModule } from './pdf-export/pdf-export.module';

@Module({
  imports: [
    BaseModule,
    SearchAttachmentsModule,
    TemplateModule,
    AiModule,
    AiChatModule,
    PageVerificationModule,
    McpModule,
    EmbeddingModule,
    PdfExportModule,
  ],
})
export class EeModule {}

