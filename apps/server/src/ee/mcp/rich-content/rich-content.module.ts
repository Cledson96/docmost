import { Module } from '@nestjs/common';
import { PageModule } from '../../../core/page/page.module';
import { TransclusionModule } from '../../../core/page/transclusion/transclusion.module';
import { BaseModule } from '../../base/base.module';
import { RichContentCapabilitiesService } from './rich-content-capabilities.service';
import { ContentReaderService } from './content-reader.service';

@Module({
  imports: [PageModule, TransclusionModule, BaseModule],
  providers: [RichContentCapabilitiesService, ContentReaderService],
  exports: [RichContentCapabilitiesService, ContentReaderService],
})
export class RichContentModule {}
