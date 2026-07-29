import { Module } from '@nestjs/common';
import { EmbeddingService } from './embedding.service';
import { EmbeddingProcessor } from './embedding.processor';

@Module({
  providers: [EmbeddingService, EmbeddingProcessor],
  exports: [EmbeddingService],
})
export class EmbeddingModule {}
