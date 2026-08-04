import { Module } from '@nestjs/common';
import { PageModule } from '../../../core/page/page.module';
import { TransclusionModule } from '../../../core/page/transclusion/transclusion.module';
import { BaseModule } from '../../base/base.module';
import { RichContentCapabilitiesService } from './rich-content-capabilities.service';
import { ContentReaderService } from './content-reader.service';
import { BlockEditService } from './block-edit.service';

@Module({
  imports: [PageModule, TransclusionModule, BaseModule],
  providers: [
    RichContentCapabilitiesService,
    ContentReaderService,
    BlockEditService,
  ],
  exports: [
    RichContentCapabilitiesService,
    ContentReaderService,
    BlockEditService,
  ],
})
export class RichContentModule {}
