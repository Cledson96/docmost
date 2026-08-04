import { Module } from '@nestjs/common';
import { RichContentCapabilitiesService } from './rich-content-capabilities.service';
import { ContentReaderService } from './content-reader.service';

@Module({
  providers: [RichContentCapabilitiesService, ContentReaderService],
  exports: [RichContentCapabilitiesService, ContentReaderService],
})
export class RichContentModule {}
