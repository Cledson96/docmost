import { Module } from '@nestjs/common';
import { McpController } from './mcp.controller';
import { McpService } from './mcp.service';
import { PageModule } from '../../core/page/page.module';
import { BaseModule } from '../base/base.module';
import { CaslModule } from '../../core/casl/casl.module';

@Module({
  imports: [PageModule, BaseModule, CaslModule],
  controllers: [McpController],
  providers: [McpService],
  exports: [McpService],
})
export class McpModule {}
