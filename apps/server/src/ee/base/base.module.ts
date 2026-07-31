import { Module } from '@nestjs/common';
import { BaseController } from './base.controller';
import { BaseService } from './base.service';
import { BaseAccessService } from './base-access.service';

@Module({
  controllers: [BaseController],
  providers: [BaseService, BaseAccessService],
  exports: [BaseService, BaseAccessService],
})
export class BaseModule {}
