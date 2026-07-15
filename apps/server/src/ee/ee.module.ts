import { Module } from '@nestjs/common';
import { BaseModule } from './base/base.module';
import { SearchAttachmentsModule } from './search-attachments/search-attachments.module';
import { TemplateModule } from './template/template.module';

@Module({
  imports: [BaseModule, SearchAttachmentsModule, TemplateModule],
})
export class EeModule {}
