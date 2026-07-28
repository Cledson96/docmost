import { Module } from '@nestjs/common';
import { McpController } from './mcp.controller';
import { McpService } from './mcp.service';
import { PageModule } from '../../core/page/page.module';
import { BaseModule } from '../base/base.module';

@Module({
  imports: [PageModule, BaseModule],
  controllers: [McpController],
  providers: [McpService],
  exports: [McpService],
})
export class McpModule {}
