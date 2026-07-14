import { Module } from '@nestjs/common';
import { BaseModule } from './base/base.module';
import { SearchAttachmentsModule } from './search-attachments/search-attachments.module';

@Module({
  imports: [
    BaseModule,
    SearchAttachmentsModule,
  ],
})
export class EeModule {}
