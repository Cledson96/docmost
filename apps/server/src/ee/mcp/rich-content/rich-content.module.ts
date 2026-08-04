import { Module } from '@nestjs/common';
import { RichContentCapabilitiesService } from './rich-content-capabilities.service';

@Module({
  providers: [RichContentCapabilitiesService],
  exports: [RichContentCapabilitiesService],
})
export class RichContentModule {}
